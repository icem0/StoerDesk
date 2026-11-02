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

/** IndexedDB-backed outbox for reports written while the device is offline. */
class OutboxDb extends Dexie {
  outbox!: Table<QueuedReport, number>

  constructor() {
    super('StörDeskOutbox')
    this.version(1).stores({
      outbox: '++id, client_uuid, status, created_at',
    })

    this.outbox = this.table('outbox')
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
