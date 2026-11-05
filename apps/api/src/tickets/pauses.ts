import { and, eq, isNull } from 'drizzle-orm'

import type { Database } from '../db/client'
import { ticketEvents, ticketPauses, tickets } from '../db/schema'

/**
 * Wait reasons of the timeline (`specs/05-timeline.md` §5.2, WP-M6-05).
 *
 * A pause starts only while the ticket still runs; at most one pause is open.
 * Start and end each write one append-only event (`paused`, `resumed`). The
 * acknowledgement auto-close of WP-M6-06 calls `closeOpenPause()` inside its own
 * transaction and writes no extra event.
 */

type Db = Database['database']
type DbLike = Pick<Db, 'select' | 'update'>

const NON_PAUSABLE = new Set(['ACKNOWLEDGED', 'CLOSED', 'CANCELLED'])

export class PauseError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'PauseError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export type PauseRow = {
  id: string
  ticketId: string
  reason: string
  startedAt: Date
  endedAt: Date | null
  startedByUserId: string | null
  endedByUserId: string | null
  createdAt: Date
}

export type PauseResult = {
  ticketNo: string
  pause: PauseRow
  eventId: string
}

function cleanReason(value: string): string {
  const reason = value.trim()

  if (reason.length < 3 || reason.length > 500) {
    throw new PauseError(400, 'invalid_pause_reason', { fields: ['reason'] })
  }

  return reason
}

export async function startTicketPause(
  database: Db,
  input: { ticketNo: string; actorUserId: string; reason: string; now?: Date },
): Promise<PauseResult> {
  const reason = cleanReason(input.reason)
  const now = input.now ?? new Date()

  return await database.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: tickets.id, ticketNo: tickets.ticketNo, status: tickets.status })
      .from(tickets)
      .where(eq(tickets.ticketNo, input.ticketNo))
      .limit(1)
      .for('update')

    if (ticket === undefined) {
      throw new PauseError(404, 'ticket_not_found', { ticketNo: input.ticketNo })
    }

    if (NON_PAUSABLE.has(ticket.status)) {
      throw new PauseError(409, 'ticket_not_pausable', { status: ticket.status })
    }

    const [open] = await tx
      .select({ id: ticketPauses.id })
      .from(ticketPauses)
      .where(and(eq(ticketPauses.ticketId, ticket.id), isNull(ticketPauses.endedAt)))
      .limit(1)

    if (open !== undefined) {
      throw new PauseError(409, 'pause_already_open', { ticketNo: ticket.ticketNo })
    }

    const [pause] = await tx
      .insert(ticketPauses)
      .values({
        ticketId: ticket.id,
        reason,
        startedAt: now,
        startedByUserId: input.actorUserId,
      })
      .returning()

    if (pause === undefined) {
      throw new PauseError(500, 'pause_create_failed', {})
    }

    const [event] = await tx
      .insert(ticketEvents)
      .values({
        ticketId: ticket.id,
        type: 'paused',
        actorKind: 'user',
        actorUserId: input.actorUserId,
        payload: { reason },
      })
      .returning({ id: ticketEvents.id })

    if (event === undefined) {
      throw new PauseError(500, 'pause_event_failed', {})
    }

    return { ticketNo: ticket.ticketNo, pause, eventId: event.id }
  })
}

export async function endTicketPause(
  database: Db,
  input: { ticketNo: string; actorUserId: string; now?: Date },
): Promise<PauseResult> {
  const now = input.now ?? new Date()

  return await database.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: tickets.id, ticketNo: tickets.ticketNo })
      .from(tickets)
      .where(eq(tickets.ticketNo, input.ticketNo))
      .limit(1)
      .for('update')

    if (ticket === undefined) {
      throw new PauseError(404, 'ticket_not_found', { ticketNo: input.ticketNo })
    }

    const [pause] = await tx
      .update(ticketPauses)
      .set({ endedAt: now, endedByUserId: input.actorUserId })
      .where(and(eq(ticketPauses.ticketId, ticket.id), isNull(ticketPauses.endedAt)))
      .returning()

    if (pause === undefined) {
      throw new PauseError(409, 'pause_not_open', { ticketNo: ticket.ticketNo })
    }

    const [event] = await tx
      .insert(ticketEvents)
      .values({
        ticketId: ticket.id,
        type: 'resumed',
        actorKind: 'user',
        actorUserId: input.actorUserId,
        payload: { pauseId: pause.id, reason: pause.reason },
      })
      .returning({ id: ticketEvents.id })

    if (event === undefined) {
      throw new PauseError(500, 'pause_event_failed', {})
    }

    return { ticketNo: ticket.ticketNo, pause, eventId: event.id }
  })
}

/** Ends the open pause of a ticket inside an existing transaction. */
export async function closeOpenPause(
  executor: DbLike,
  input: { ticketId: string; actorUserId: string; at: Date },
): Promise<boolean> {
  const closed = await executor
    .update(ticketPauses)
    .set({ endedAt: input.at, endedByUserId: input.actorUserId })
    .where(and(eq(ticketPauses.ticketId, input.ticketId), isNull(ticketPauses.endedAt)))
    .returning({ id: ticketPauses.id })

  return closed.length > 0
}
