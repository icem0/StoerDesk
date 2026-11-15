import { asc } from 'drizzle-orm'
import { ticketTransitionSchema, type TicketTransition } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { ticketTransitions } from '../db/schema'

/**
 * The steps of the ticket workflow as configuration
 * (`specs/07-escalation.md` §7.13, ADR-0025, WP-M14-38b).
 *
 * WP-M14-38a turned the code map `TRANSITIONS` into the `ticket_transitions`
 * table: a step is a row from one status key to another one, performed by one
 * event key, and the administration (WP-M14-39) edits those rows. This module
 * only reads and resolves them — no create, update or delete (WP-M14-39) and
 * no evaluation of the stored `condition` (WP-M14-41).
 *
 * `resolveTransition()` is pure, so the engine (`transitionTicket()` of
 * WP-M14-38c) loads the rows once per call and resolves the step there; `undefined`
 * means an unknown or inactive combination, which the engine answers
 * `409 invalid_transition` with.
 */

type Db = Database['database']

/** Every row of `ticket_transitions`, active and inactive, in a stable order. */
export async function readTicketTransitions(database: Db): Promise<TicketTransition[]> {
  const rows = await database
    .select()
    .from(ticketTransitions)
    .orderBy(asc(ticketTransitions.fromStatus), asc(ticketTransitions.eventKey))

  return rows.map((row) =>
    ticketTransitionSchema.parse({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      eventKey: row.eventKey,
      condition: row.conditionJson ?? null,
      active: row.active,
    }),
  )
}

/**
 * The row that performs the step `eventKey` out of `fromStatus`, or `undefined`
 * when no **active** row does. An inactive row never changes a ticket, so it
 * resolves like a missing one; the caller decides the error.
 */
export function resolveTransition(
  transitions: readonly TicketTransition[],
  fromStatus: string,
  eventKey: string,
): TicketTransition | undefined {
  for (const transition of transitions) {
    if (
      transition.active &&
      transition.fromStatus === fromStatus &&
      transition.eventKey === eventKey
    ) {
      return transition
    }
  }

  return undefined
}
