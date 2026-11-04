import Dexie, { type Table } from 'dexie'

import { apiFetch } from './api'
import type { PublicReport, PublicReportRequest } from '@stoerdesk/shared'

const jsonHeaders = { 'content-type': 'application/json' }

export interface QueuedReport {
  id?: number
  client_uuid: string
  payload: PublicReportRequest
  status: 'queued' | 'sending' | 'sent' | 'failed'
  retries: number
  created_at: number
}

/**
 * The three internal writes phase 5 allows offline (`PLAN.md` §10):
 * acknowledge, comment and decline. Claiming and shift confirmations stay
 * online-only (`specs/09-offline.md` §9.6).
 */
export type InternalActionKind = 'acknowledge' | 'comment' | 'decline'

/**
 * One queued internal write. `client_uuid` is the idempotency key the API
 * receipts of WP-M5-02 deduplicate on; `conflict` rows are the server-side
 * rejections of WP-M5-06 and are never auto-retried.
 */
export interface QueuedAction {
  id?: number
  client_uuid: string
  ticket_no: string
  action: InternalActionKind
  payload: Record<string, unknown>
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'conflict'
  error_code?: string
  ticket_status?: string
  retries: number
  created_at: number
}

/** IndexedDB-backed outbox for reports and internal actions written offline. */
class OutboxDb extends Dexie {
  outbox!: Table<QueuedReport, number>
  internal_actions!: Table<QueuedAction, number>

  constructor() {
    super('StörDeskOutbox')
    this.version(1).stores({
      outbox: '++id, client_uuid, status, created_at',
    })
    this.version(2).stores({
      outbox: '++id, client_uuid, status, created_at',
      internal_actions: '++id, client_uuid, ticket_no, status, created_at',
    })

    this.outbox = this.table('outbox')
    this.internal_actions = this.table('internal_actions')
  }
}

export const outboxDb = new OutboxDb()

/** `true` when the browser can persist reports (IndexedDB is available). */
export function outboxAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

/** Persist one report for later delivery. Resolves with the outbox row id. */
export async function enqueueReport(payload: PublicReportRequest): Promise<number> {
  return outboxDb.outbox.add({
    client_uuid: payload.clientUuid,
    payload,
    status: 'queued',
    retries: 0,
    created_at: Date.now(),
  })
}

/** All waiting reports, oldest first. */
export async function queuedReports(): Promise<QueuedReport[]> {
  return outboxDb.outbox.orderBy('created_at').toArray()
}

/** Drop a delivered report from the outbox. */
export async function removeReport(id: number): Promise<void> {
  await outboxDb.outbox.delete(id)
}

/** Replay every waiting report through the public report endpoint. */
export async function replayOutbox(): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  const reports = await queuedReports()

  for (const report of reports) {
    try {
      await apiFetch<PublicReport>('/v1/public/tickets', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(report.payload),
      })

      if (report.id !== undefined) {
        await removeReport(report.id)
      }

      sent += 1
    } catch {
      failed += 1
    }
  }

  return { sent, failed }
}

/** Persist one internal write for later delivery. Resolves with the row id. */
export async function enqueueInternalAction(input: {
  ticketNo: string
  action: InternalActionKind
  payload?: Record<string, unknown>
}): Promise<number> {
  return outboxDb.internal_actions.add({
    client_uuid: crypto.randomUUID(),
    ticket_no: input.ticketNo,
    action: input.action,
    payload: input.payload ?? {},
    status: 'queued',
    retries: 0,
    created_at: Date.now(),
  })
}

/** All waiting internal actions, oldest first. */
export async function queuedActions(): Promise<QueuedAction[]> {
  return outboxDb.internal_actions.orderBy('created_at').toArray()
}

/** Merge changes into one queued action row. */
export async function updateAction(id: number, changes: Partial<QueuedAction>): Promise<void> {
  await outboxDb.internal_actions.update(id, changes)
}

/** Drop a delivered action from the outbox. */
export async function removeAction(id: number): Promise<void> {
  await outboxDb.internal_actions.delete(id)
}

/** Waiting rows of both kinds, e.g. for the clean-update guard. */
export async function pendingWrites(): Promise<{ reports: number; actions: number }> {
  const [reports, actions] = await Promise.all([
    outboxDb.outbox
      .filter((row) => row.status === 'queued' || row.status === 'sending' || row.status === 'failed')
      .count(),
    outboxDb.internal_actions
      .filter(
        (row) =>
          row.status === 'queued' || row.status === 'sending' || row.status === 'failed',
      )
      .count(),
  ])

  return { reports, actions }
}

/** Route segment of every internal action kind (`WP-M2-19c`). */
const ACTION_SEGMENTS: Record<InternalActionKind, string> = {
  acknowledge: 'acknowledge',
  comment: 'comments',
  decline: 'decline',
}

/**
 * Deliver one queued action. The row keeps its `client_uuid` in the body, so a
 * repeated delivery is idempotent on the server (WP-M5-04). WP-M5-01 marks
 * every rejected row `failed`; the conflict decision of WP-M5-06 refines this.
 */
export async function deliverAction(row: QueuedAction): Promise<boolean> {
  try {
    await apiFetch<never>(`/v1/tickets/${row.ticket_no}/${ACTION_SEGMENTS[row.action]}`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ clientUuid: row.client_uuid, ...row.payload }),
    })

    if (row.id !== undefined) {
      await removeAction(row.id)
    }

    return true
  } catch {
    if (row.id !== undefined) {
      await updateAction(row.id, { status: 'failed', retries: row.retries + 1 })
    }

    return false
  }
}

/** Replay every waiting internal action, oldest first. */
export async function replayInternalActions(): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const action of await queuedActions()) {
    if (action.status !== 'queued' && action.status !== 'failed') {
      continue
    }

    if (action.id !== undefined) {
      await updateAction(action.id, { status: 'sending' })
    }

    if (await deliverAction({ ...action, status: 'sending' })) {
      sent += 1
    } else {
      failed += 1
    }
  }

  return { sent, failed }
}
