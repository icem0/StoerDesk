import { asc, eq } from 'drizzle-orm'
import {
  ticketTransitionSchema,
  ticketTransitionNotFoundCode,
  type TicketTransition,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { ticketStatuses, ticketTransitions } from '../db/schema'

/**
 * The steps of the ticket workflow as configuration
 * (`specs/07-escalation.md` §7.13, ADR-0025, WP-M14-38b, WP-M14-39).
 *
 * WP-M14-38a turned the code map `TRANSITIONS` into the `ticket_transitions`
 * table: a step is a row from one status key to another one, performed by one
 * event key, and the administration (`transition-routes.ts` of WP-M14-39)
 * reads, creates, edits and deletes those rows. `readTicketTransitions()`
 * answers every row (active and inactive) in the order of `from_status` and
 * `event_key` and the pure `resolveTransition()` returns the row that performs
 * a step, so `transitionTicket()` of WP-M14-38c loads them once per call and
 * decides the error there; `condition` is stored now but evaluated only by
 * WP-M14-41.
 *
 * A transition whose `from_status` or `to_status` names no row of `ticket_statuses`
 * is a `400 invalid_status_key` — the foreign keys of migration `0041` are the
 * database backstop of that rule — and a step that duplicates the unique index
 * `(from_status, event_key)` of that migration answers `409 transition_duplicate`.
 * An unknown `id` answers `404 transition_not_found`.
 */

type Db = Database['database']

export class TicketTransitionServiceError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketTransitionServiceError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

/** Is that key a row of `ticket_statuses`? */
async function statusExists(database: Db, key: string): Promise<boolean> {
  const [row] = await database
    .select({ key: ticketStatuses.key })
    .from(ticketStatuses)
    .where(eq(ticketStatuses.key, key))
    .limit(1)

  return row !== undefined
}

function asTransition(row: {
  id: string
  fromStatus: string
  toStatus: string
  eventKey: string
  conditionJson: unknown
  active: boolean
}): TicketTransition {
  return ticketTransitionSchema.parse({
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    eventKey: row.eventKey,
    condition: row.conditionJson ?? null,
    active: row.active,
  })
}

/** Every row of `ticket_transitions`, active and inactive, in a stable order. */
export async function readTicketTransitions(database: Db): Promise<TicketTransition[]> {
  const rows = await database
    .select()
    .from(ticketTransitions)
    .orderBy(asc(ticketTransitions.fromStatus), asc(ticketTransitions.eventKey))

  return rows.map(asTransition)
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

/**
 * WP-M14-39 — the transition administration.
 *
 * A new row has to name two status keys that exist in `ticket_statuses` and
 * must not duplicate the unique index `(from_status, event_key)` of migration
 * `0041`. An edit keeps the `id` — the row identity — and re-checks both rules;
 * a delete removes the row. ADR-0025 keeps the trade-off of an empty workflow
 * visible (the administration never blocks a delete on a step count).
 */
export async function createTicketTransition(
  database: Db,
  body: {
    fromStatus: string
    toStatus: string
    eventKey: string
    condition?: Record<string, unknown> | null
    active?: boolean
  },
): Promise<TicketTransition> {
  await assertStatusKeys(
    database,
    [
      { field: 'fromStatus', key: body.fromStatus },
      { field: 'toStatus', key: body.toStatus },
    ],
  )

  try {
    const [row] = await database
      .insert(ticketTransitions)
      .values({
        fromStatus: body.fromStatus,
        toStatus: body.toStatus,
        eventKey: body.eventKey,
        conditionJson: body.condition ?? null,
        active: body.active ?? true,
      })
      .returning()

    if (row === undefined) {
      throw new TicketTransitionServiceError(500, 'transition_create_failed')
    }

    return asTransition(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TicketTransitionServiceError(
        409,
        'transition_duplicate',
        {
          fields: ['fromStatus', 'eventKey'],
          fromStatus: body.fromStatus,
          eventKey: body.eventKey,
        },
      )
    }

    throw error
  }
}

/** Both keys are rows of `ticket_statuses` — otherwise `400 invalid_status_key`. */
async function assertStatusKeys(
  database: Db,
  candidates: { field: string; key: string }[],
): Promise<void> {
  const fields: string[] = []

  for (const candidate of candidates) {
    if (!(await statusExists(database, candidate.key))) {
      fields.push(candidate.field)
    }
  }

  if (fields.length > 0) {
    throw new TicketTransitionServiceError(400, 'invalid_status_key', { fields })
  }
}

/**
 * Edit one row — the `id` stays its identity, so it never enters the body.
 * An unknown `id` answers `404 transition_not_found`; a new `(from_status,
 * event_key)` pair that another row already owns answers `409 transition_duplicate`;
 * a status key that names no row of `ticket_statuses` answers `400 invalid_status_key`.
 */
export async function updateTicketTransition(
  database: Db,
  id: string,
  body: {
    fromStatus?: string
    toStatus?: string
    eventKey?: string
    condition?: Record<string, unknown> | null
    active?: boolean
  },
): Promise<TicketTransition> {
  const [current] = await database
    .select()
    .from(ticketTransitions)
    .where(eq(ticketTransitions.id, id))
    .limit(1)

  if (current === undefined) {
    throw new TicketTransitionServiceError(404, ticketTransitionNotFoundCode, { fields: ['id'] })
  }

  const fromStatus = body.fromStatus ?? current.fromStatus
  const toStatus = body.toStatus ?? current.toStatus

  await assertStatusKeys(
    database,
    [
      { field: 'fromStatus', key: fromStatus },
      { field: 'toStatus', key: toStatus },
    ],
  )

  try {
    const [updated] = await database
      .update(ticketTransitions)
      .set({
        fromStatus,
        toStatus,
        eventKey: body.eventKey ?? current.eventKey,
        conditionJson: body.condition === undefined ? current.conditionJson : body.condition,
        active: body.active ?? current.active,
        updatedAt: new Date(),
      })
      .where(eq(ticketTransitions.id, id))
      .returning()

    if (updated === undefined) {
      throw new TicketTransitionServiceError(404, ticketTransitionNotFoundCode, { fields: ['id'] })
    }

    return asTransition(updated)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TicketTransitionServiceError(
        409,
        'transition_duplicate',
        {
          fields: ['fromStatus', 'eventKey'],
          fromStatus,
          eventKey: body.eventKey ?? current.eventKey,
        },
      )
    }

    throw error
  }
}

/**
 * Remove one row — `404 transition_not_found` for an unknown `id`. There is no
 * guard on the number of rows (ADR-0025 consequence: an installation whose
 * transition rows are all deleted has no workflow any more, and the administration
 * keeps that trade-off visible in the UI of WP-M14-39b).
 */
export async function deleteTicketTransition(
  database: Db,
  id: string,
): Promise<TicketTransition> {
  const [current] = await database
    .select()
    .from(ticketTransitions)
    .where(eq(ticketTransitions.id, id))
    .limit(1)

  if (current === undefined) {
    throw new TicketTransitionServiceError(404, ticketTransitionNotFoundCode, { fields: ['id'] })
  }

  await database
    .delete(ticketTransitions)
    .where(eq(ticketTransitions.id, id))

  return asTransition(current)
}
