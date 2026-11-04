import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import {
  internalActionReceipts,
  ticketEvents,
  tickets,
  type Ticket,
  type TicketEvent,
} from '../db/schema'
import { TicketTransitionError, transitionTicket } from './workflow'

type Db = Database['database']

/**
 * Idempotent execution of an internal offline action (`PLAN.md` §10,
 * WP-M5-03).
 *
 * `applyInternalAction` is the single service function the acknowledge,
 * comment and decline routes of WP-M5-04 share. Replay validation of an
 * offline outbox write lives here in exactly one place:
 *
 * - a receipt for `client_uuid` short-circuits a replay (`replayed: true`,
 *   nothing is written),
 * - a receipt whose actor differs throws `403 action_actor_mismatch`,
 * - an invalid state-machine transition throws `409 invalid_transition`
 *   with `from` in `params` and writes no receipt.
 *
 * The action execution (transition or comment event) and the receipt insert
 * run in the same transaction, so a conflict never leaves a receipt behind.
 */

class InternalActionError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'InternalActionError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

const ACTION_EVENT: Record<'acknowledge' | 'decline', string> = {
  acknowledge: 'acknowledged',
  decline: 'declined',
}

type ApplyInternalActionCtx = {
  database: Db
  ticketNo: string
  clientUuid: string
  action: 'acknowledge' | 'comment' | 'decline'
  actorUserId: string
  payload?: Record<string, unknown>
}

export type ApplyInternalActionResult = {
  replayed: boolean
  ticket: Ticket
  event: TicketEvent
}

/**
 * Apply one internal action idempotently (§PLAN.md §10).
 *
 * Throws `InternalActionError` with an HTTP status code and an `{ code,
 * params }` error contract on replay-actor mismatch, unknown ticket or
 * invalid transition.
 */
export async function applyInternalAction(
  ctx: ApplyInternalActionCtx,
): Promise<ApplyInternalActionResult> {
  const {
    database,
    ticketNo,
    clientUuid,
    action,
    actorUserId,
    payload = {},
  } = ctx

  return await database.transaction(async (tx) => {
    // Resolve the ticket by its public number.
    const [ticket] = await tx
      .select()
      .from(tickets)
      .where(eq(tickets.ticketNo, ticketNo))
      .limit(1)

    if (ticket === undefined) {
      throw new InternalActionError(404, 'ticket_not_found', { ticketNo })
    }

    // Look up an existing receipt for the idempotency key.
    const [receipt] = await tx
      .select()
      .from(internalActionReceipts)
      .where(eq(internalActionReceipts.clientUuid, clientUuid))
      .limit(1)

    if (receipt !== undefined) {
      // Actor binding: the same client_uuid replayed by a different actor is
      // a conflict, not a silent replay.
      if (receipt.actorUserId !== actorUserId) {
        throw new InternalActionError(403, 'action_actor_mismatch', {
          clientUuid,
          action: receipt.action,
          ticketNo,
        })
      }

      // Replay short-circuit: return the stored event and write nothing.
      const [event] = await tx
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.id, receipt.eventId))
        .limit(1)

      if (event === undefined) {
        throw new InternalActionError(404, 'ticket_event_not_found', {
          eventId: receipt.eventId,
        })
      }

      return { replayed: true, ticket, event }
    }

    // Execute the action inside the same transaction as the receipt insert.
    let event: TicketEvent

    if (action === 'comment') {
      const [inserted] = await tx
        .insert(ticketEvents)
        .values({
          ticketId: ticket.id,
          type: 'comment',
          actorKind: 'user',
          actorUserId,
          payload,
        })
        .returning()

      if (inserted === undefined) {
        throw new InternalActionError(500, 'comment_not_written', { ticketNo })
      }

      event = inserted
    } else {
      const eventName = ACTION_EVENT[action]

      try {
        const result = await transitionTicket({
          database: tx as unknown as Db,
          ticketId: ticket.id,
          event: eventName,
          actorUserId,
          payload,
        })

        event = result.event
      } catch (error) {
        // An invalid transition (409) must not write a receipt — rethrow as
        // the conflict signal of WP-M5-04/WP-M5-07.
        if (error instanceof TicketTransitionError) {
          throw error
        }
        throw error
      }
    }

    // Write the receipt only when the action executed; never for a conflict.
    await tx.insert(internalActionReceipts).values({
      clientUuid,
      ticketId: ticket.id,
      actorUserId,
      action,
      eventId: event.id,
    })

    return { replayed: false, ticket, event }
  })
}

export type ApplyInternalActionInput = ApplyInternalActionCtx
