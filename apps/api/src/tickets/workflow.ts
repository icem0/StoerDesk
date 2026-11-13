import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { ticketEvents, tickets } from '../db/schema'
import { closeOpenPause } from './pauses'

/**
 * Ticket state machine (`PLAN.md` §7, WP-M2-19b).
 *
 * `transitionTicket()` validates the current status against the transition map,
 * updates the ticket row and writes one append-only `ticket_events` row in the
 * same transaction. Invalid transitions throw `TicketTransitionError` (HTTP 409).
 * Permission enforcement happens at the route guard (`requirePermission`);
 * this function only validates the state-machine transition.
 *
 * The workflow columns (`assigned_user_id`, `reviewed_by_user_id`, `accepted_at`,
 * `acknowledged_at`, `closed_at`, …) are added by migration 0006 and will be
 * written here once WP-M2-19c wires them into the route payloads.
 *
 * Returns the updated ticket together with the appended event row so callers
 * (e. g. `applyInternalAction` of WP-M5-03) can reference the event id.
 */

type Db = Database['database']

export class TicketTransitionError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketTransitionError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

const INVALID_TRANSITION = (ticketNo: string, from: string, event: string) =>
  new TicketTransitionError(409, 'invalid_transition', { ticketNo, from, event })

const TICKET_NOT_FOUND = (ticketId: string) =>
  new TicketTransitionError(404, 'ticket_not_found', { ticketId })

const TRANSITIONS: Record<string, Record<string, { to: string }>> = {
  NEW: {
    review_started: { to: 'IN_REVIEW' },
  },
  IN_REVIEW: {
    work_order_set: { to: 'WORK_ORDER_CREATED' },
  },
  WORK_ORDER_CREATED: {
    assigned: { to: 'ASSIGNED' },
    offered: { to: 'OFFERED' },
  },
  OFFERED: {
    claimed: { to: 'ASSIGNED' },
    accepted: { to: 'ACCEPTED' },
    declined: { to: 'WORK_ORDER_CREATED' },
  },
  ASSIGNED: {
    accepted: { to: 'ACCEPTED' },
    declined: { to: 'WORK_ORDER_CREATED' },
  },
  ACCEPTED: {
    acknowledged: { to: 'ACKNOWLEDGED' },
  },
  ACKNOWLEDGED: {
    closed: { to: 'CLOSED' },
  },
  CLOSED: {
    reopened: { to: 'NEW' },
  },
  CANCELLED: {
    uncancelled: { to: 'NEW' },
  },
  '*': {
    cancelled: { to: 'CANCELLED' },
  },
}

type TransitionContext = {
  database: Db
  ticketId: string
  event: string
  actorUserId?: string
  /** `system` for an API-key action, `user` for the office session (WP-M10-08). */
  actorKind?: 'user' | 'system'
  /** Recorded in the event payload for a system action, never the token. */
  apiKeyId?: string
  payload?: Record<string, unknown>
}

export async function transitionTicket(ctx: TransitionContext) {
  const { database, ticketId, event, actorUserId, apiKeyId, payload = {} } = ctx
  const actorKind = ctx.actorKind ?? 'user'
  const eventPayload =
    actorKind === 'system' && apiKeyId !== undefined ? { ...payload, apiKeyId } : payload

  const [ticket] = await database
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      status: tickets.status,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (ticket === undefined) {
    throw TICKET_NOT_FOUND(ticketId)
  }

  const fromStatus = ticket.status
  const byStatus = TRANSITIONS[fromStatus]
  const transition = byStatus?.[event] ?? TRANSITIONS['*']?.[event]

  if (transition === undefined) {
    throw INVALID_TRANSITION(ticket.ticketNo, fromStatus, event)
  }

  return await database.transaction(async (tx) => {
    // The UPDATE re-checks the status (`UPDATE … WHERE status = <from>`), so two
    // concurrent transitions of the same ticket produce exactly one winner —
    // the first acceptance wins atomically (`PLAN.md` §12, the claim conflict of
    // §16.1/3). A stale status read alone must never decide the transition.
    // The workflow columns of `PLAN.md` §7 belong to the transition that sets
    // them (`specs/05-timeline.md` §5.2: the timeline stops at `acknowledged`).
    // They are written in the same statement as the status, so a reader never
    // sees a status whose timestamp is missing.
    const at = new Date()
    const workflowColumns: Partial<typeof tickets.$inferInsert> = {}

    if (event === 'review_started') {
      workflowColumns.reviewStartedAt = at
      if (actorKind === 'user' && actorUserId !== undefined) {
        workflowColumns.reviewedByUserId = actorUserId
      }
    } else if (event === 'work_order_set') {
      if (typeof payload.text === 'string') {
        workflowColumns.workOrderText = payload.text
      }
    } else if (event === 'accepted') {
      workflowColumns.acceptedAt = at
    } else if (event === 'acknowledged') {
      workflowColumns.acknowledgedAt = at
    } else if (event === 'closed') {
      workflowColumns.closedAt = at
    }

    const [updated] = await tx
      .update(tickets)
      .set({ ...workflowColumns, status: transition.to, updatedAt: at })
      .where(and(eq(tickets.id, ticketId), eq(tickets.status, fromStatus)))
      .returning()

    if (updated === undefined) {
      throw INVALID_TRANSITION(ticket.ticketNo, fromStatus, event)
    }

    const [insertedEvent] = await tx
      .insert(ticketEvents)
      .values({
        ticketId: updated.id,
        type: event,
        actorKind,
        actorUserId: actorKind === 'system' ? null : actorUserId,
        payload: eventPayload,
      })
      .returning()

    if (insertedEvent === undefined) {
      throw TICKET_NOT_FOUND(ticketId)
    }

    // The timeline stops at acknowledgement and the ticket leaves the workflow;
    // an open wait reason must not outlive that step (specs/05-timeline.md §5.2).
    if (event === 'acknowledged' || event === 'closed' || event === 'cancelled') {
      await closeOpenPause(tx, {
        ticketId,
        actorUserId: actorUserId ?? null,
        at: new Date(),
      })
    }

    return { ticket: updated, event: insertedEvent }
  })
}

export type TransitionTicketInput = TransitionContext
