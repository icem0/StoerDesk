import { and, asc, desc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import {
  oncallPools,
  oncallShifts,
  outbox,
  ticketEvents,
  tickets,
} from '../db/schema'
import { TicketTransitionError } from '../tickets/workflow'
import { enqueueOncallOutbox } from '../notifications/outbox'
import { readOncallSettings } from './settings'
import {
  isCoveredByPattern,
  parseOncallPattern,
  type NotificationEventType,
} from '@stoerdesk/shared'

/**
 * On-call ticket coupling (`specs/04-oncall.md` §4a.6, WP-M8-10).
 *
 * `resolveOnCallPerson` maps an instant to the technician who is responsible
 * for it: a `CONFIRMED` (or `SWAP_REQUESTED`) shift wins over a `PLANNED` one,
 * and a slot without either is `unstaffed`. `offerTicket` applies that result
 * to the `offered` transition of `WORK_ORDER_CREATED` in one transaction.
 */

type Db = Database['database']

/** The shift states that count for ticket coupling (§4a.6). */
export const ONCALL_STAFFED_STATES = ['CONFIRMED', 'SWAP_REQUESTED', 'PLANNED'] as const

export type OnCallResolutionKind = 'confirmed' | 'planned' | 'unstaffed'

export type OnCallResolution = {
  kind: OnCallResolutionKind
  userId?: string
  shiftId?: string
  poolId: string | null
  endsAt?: Date
}

export type ResolveOnCallPersonInput = {
  at: Date
  poolId?: string
}

/**
 * Resolves the default pool: the configured `oncall.default_pool_id`, otherwise
 * the first active pool by lower-case name. Returns `null` when no pool exists.
 */
export async function resolveDefaultPool(database: Db): Promise<string | null> {
  const settings = await readOncallSettings(database)

  if (settings.defaultPoolId !== undefined) {
    return settings.defaultPoolId
  }

  const [pool] = await database
    .select({ id: oncallPools.id })
    .from(oncallPools)
    .where(eq(oncallPools.active, true))
    .orderBy(sql`lower(${oncallPools.name})`)
    .limit(1)

  return pool?.id ?? null
}

/**
 * Returns who is on call at `at` in the requested (or default) pool. A
 * `CONFIRMED` or `SWAP_REQUESTED` shift counts with its original technician;
 * a `PLANNED` one counts with a warning. `DRAFT`, `UNFILLED` and `DECLINED`
 * never count (§4a.6).
 */
export async function resolveOnCallPerson(
  database: Db,
  input: ResolveOnCallPersonInput,
): Promise<OnCallResolution> {
  const { at } = input
  const poolId = input.poolId ?? (await resolveDefaultPool(database))

  if (poolId === null) {
    return { kind: 'unstaffed', poolId: null }
  }

  const rows = await database
    .select({
      id: oncallShifts.id,
      userId: oncallShifts.userId,
      state: oncallShifts.state,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
      weekdays: oncallShifts.weekdays,
      dailyStart: oncallShifts.dailyStart,
      dailyEnd: oncallShifts.dailyEnd,
    })
    .from(oncallShifts)
    .where(
      and(
        eq(oncallShifts.poolId, poolId),
        inArray(oncallShifts.state, ONCALL_STAFFED_STATES),
        lte(oncallShifts.startsAt, at),
        gt(oncallShifts.endsAt, at),
      ),
    )
    .orderBy(asc(oncallShifts.startsAt))

  // A shift of a duty block covers only the instants of its pattern
  // (`specs/04-oncall.md` §4a.3.3, ADR-0040 decision 5); a shift without a
  // pattern covers its whole span.
  const covered = rows.filter((row) =>
    isCoveredByPattern(
      {
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        pattern: parseOncallPattern(row),
      },
      at,
    ),
  )

  const confirmed = covered.find(
    (row) => row.state === 'CONFIRMED' || row.state === 'SWAP_REQUESTED',
  )
  const planned = covered.find((row) => row.state === 'PLANNED')
  const shift = confirmed ?? planned

  if (shift === undefined) {
    return { kind: 'unstaffed', poolId }
  }

  return {
    kind: confirmed === undefined ? 'planned' : 'confirmed',
    userId: shift.userId ?? undefined,
    shiftId: shift.id,
    poolId,
    endsAt: shift.endsAt,
  }
}

/**
 * The pools with a staffed shift at `at` (`specs/04-oncall.md` §4a.6,
 * ADR-0030): a `CONFIRMED`, a `SWAP_REQUESTED` or a `PLANNED` shift that
 * covers the moment and has a technician. The scan of the escalation reads the
 * pools once, so the condition `shift` of a rule can ask for the readiness
 * service (§7.4).
 */
export async function resolveStaffedPoolIds(
  database: Db,
  at: Date = new Date(),
): Promise<string[]> {
  const rows = await database
    .select({
      poolId: oncallShifts.poolId,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
      weekdays: oncallShifts.weekdays,
      dailyStart: oncallShifts.dailyStart,
      dailyEnd: oncallShifts.dailyEnd,
    })
    .from(oncallShifts)
    .where(
      and(
        inArray(oncallShifts.state, ONCALL_STAFFED_STATES),
        isNotNull(oncallShifts.userId),
        lte(oncallShifts.startsAt, at),
        gt(oncallShifts.endsAt, at),
      ),
    )

  return [
    ...new Set(
      rows
        .filter((row) =>
          isCoveredByPattern(
            {
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              pattern: parseOncallPattern(row),
            },
            at,
          ),
        )
        .map((row) => row.poolId),
    ),
  ]
}

/**
 * The technicians with a shift in the pool at `at` (ADR-0030): the addressees
 * of a notification with a readiness pool as its target. A pool without a
 * staffed shift has no addressee — the members of the pool without a shift
 * receive nothing.
 */
export async function resolveOnDutyUserIds(
  database: Db,
  poolId: string,
  at: Date = new Date(),
): Promise<string[]> {
  const rows = await database
    .select({
      userId: oncallShifts.userId,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
      weekdays: oncallShifts.weekdays,
      dailyStart: oncallShifts.dailyStart,
      dailyEnd: oncallShifts.dailyEnd,
    })
    .from(oncallShifts)
    .where(
      and(
        eq(oncallShifts.poolId, poolId),
        inArray(oncallShifts.state, ONCALL_STAFFED_STATES),
        isNotNull(oncallShifts.userId),
        lte(oncallShifts.startsAt, at),
        gt(oncallShifts.endsAt, at),
      ),
    )

  return [
    ...new Set(
      rows
        .filter((row) =>
          isCoveredByPattern(
            {
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              pattern: parseOncallPattern(row),
            },
            at,
          ),
        )
        .map((row) => row.userId)
        .filter((userId): userId is string => userId !== null),
    ),
  ]
}

export type OfferTicketInput = {
  database: Db
  ticketNo: string
  actorUserId: string
  poolId?: string
}
export type OfferTicketResult = {
  ticket: typeof tickets.$inferSelect
  warning?: 'oncall_unconfirmed' | 'oncall_unstaffed'
}

/**
 * Implements the `offered` transition of `WORK_ORDER_CREATED` in one
 * transaction: sets `OFFERED`, assigns `offered_to_user_id` and the escalation
 * deadline for a staffed shift, clears both when unstaffed, and appends the
 * `offered` event with the on-call resolution in its payload (§4a.6).
 */
export async function offerTicket(input: OfferTicketInput): Promise<OfferTicketResult> {
  const { database, ticketNo, actorUserId, poolId } = input
  const now = new Date()

  const [ticket] = await database
    .select({ id: tickets.id, ticketNo: tickets.ticketNo, status: tickets.status })
    .from(tickets)
    .where(eq(tickets.ticketNo, ticketNo))
    .limit(1)

  if (ticket === undefined) {
    throw new TicketTransitionError(404, 'ticket_not_found', { ticketNo })
  }

  const resolution = await resolveOnCallPerson(database, { at: now, poolId })
  const settings = await readOncallSettings(database)

  const staffed = resolution.kind !== 'unstaffed'
  const warning =
    resolution.kind === 'unstaffed'
      ? 'oncall_unstaffed'
      : resolution.kind === 'planned'
        ? 'oncall_unconfirmed'
        : undefined

  const offerEscalatedAt = staffed
    ? new Date(now.getTime() + settings.escalateToGroupAfterMin * 60 * 1000)
    : null

  const payload: Record<string, unknown> = {
    onCall: resolution.kind,
    shiftId: resolution.shiftId ?? null,
    poolId: resolution.poolId,
  }

  if (warning !== undefined) {
    payload.warning = warning
  }

  return await database.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: tickets.status })
      .from(tickets)
      .where(eq(tickets.id, ticket.id))
      .for('update')

    if (current === undefined) {
      throw new TicketTransitionError(404, 'ticket_not_found', { ticketNo })
    }

    if (current.status !== 'WORK_ORDER_CREATED') {
      throw new TicketTransitionError(409, 'invalid_transition', {
        ticketNo,
        from: current.status,
        event: 'offered',
      })
    }

    const [updated] = await tx
      .update(tickets)
      .set({
        status: 'OFFERED',
        offeredToUserId: staffed ? (resolution.userId ?? null) : null,
        offerEscalatedAt,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id))
      .returning()

    if (updated === undefined) {
      throw new TicketTransitionError(404, 'ticket_not_found', { ticketNo })
    }

    await tx.insert(ticketEvents).values({
      ticketId: updated.id,
      type: 'offered',
      actorKind: 'user',
      actorUserId,
      payload,
    })

    return { ticket: updated, warning }
  })
}

export type EscalateOnCallOffersResult = {
  scanned: number
  escalated: number
}

/**
 * Escalates timed-out on-call offers to the group (`specs/04-oncall.md` §4a.6,
 * WP-M8-11). Selects `OFFERED` tickets whose `offer_escalated_at` has passed and
 * clears `offered_to_user_id`, resets `offer_escalated_at` and appends one
 * `offer_escalated` event per ticket in its own transaction. A ticket that was
 * already cleared or left `OFFERED` is skipped, so a second scan is a no-op.
 */
export async function escalateOnCallOffers(
  database: Db,
  now: Date = new Date(),
): Promise<EscalateOnCallOffersResult> {
  const candidates = await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.status, 'OFFERED'),
        isNotNull(tickets.offeredToUserId),
        isNotNull(tickets.offerEscalatedAt),
        lte(tickets.offerEscalatedAt, now),
      ),
    )

  let escalated = 0

  for (const candidate of candidates) {
    await database.transaction(async (tx) => {
      const [updated] = await tx
        .update(tickets)
        .set({
          offeredToUserId: null,
          offerEscalatedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(tickets.id, candidate.id),
            eq(tickets.status, 'OFFERED'),
            isNotNull(tickets.offeredToUserId),
          ),
        )
        .returning({ id: tickets.id })

      if (updated === undefined) {
        return
      }

      await tx.insert(ticketEvents).values({
        ticketId: updated.id,
        type: 'offer_escalated',
        actorKind: 'system',
        payload: { reason: 'oncall_timeout' },
      })

      escalated += 1
    })
  }

  return { scanned: candidates.length, escalated }
}

/** The shift states whose technician still has to decide (`specs/04-oncall.md` §4a.4). */
const REMINDER_STATES = ['DRAFT', 'PLANNED'] as const

/** The readiness event the per-minute escalation scan queues (ADR-0021, §11.7). */
const REMINDER_EVENT_TYPE: NotificationEventType = 'oncall.unconfirmed_reminder'

export type EnqueueOncallRemindersResult = {
  remindersQueued: number
}

/**
 * Queues the reminder of an unconfirmed readiness (`specs/04-oncall.md` §4a.4,
 * `specs/10-notifications.md` §11.7, ADR-0021, WP-M14-31, WP-M23-09b): a
 * `DRAFT` or `PLANNED` shift that has a technician, has not started and starts
 * within `oncall.reminder_unconfirmed_h`.
 *
 * The sweep repeats the reminder: it counts the reminders of the shift and
 * sends a further one after `oncall.reminder_repeat_h` hours, as long as the
 * shift is still waiting for a decision. A row that is still `PENDING` holds
 * the next reminder back — one at a time. Every row goes through
 * `enqueueOncallOutbox` of WP-M14-28 — one transaction per shift, never a
 * channel call (§11.7).
 */
export async function enqueueOncallReminders(
  database: Db,
  env: Env,
  now: Date = new Date(),
): Promise<EnqueueOncallRemindersResult> {
  const settings = await readOncallSettings(database)
  const windowEndsAt = new Date(now.getTime() + settings.reminderUnconfirmedH * 60 * 60 * 1000)

  const candidates = await database
    .select({
      id: oncallShifts.id,
      poolId: oncallShifts.poolId,
      userId: oncallShifts.userId,
      state: oncallShifts.state,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
    })
    .from(oncallShifts)
    .where(
      and(
        inArray(oncallShifts.state, REMINDER_STATES),
        isNotNull(oncallShifts.userId),
        gt(oncallShifts.startsAt, now),
        lte(oncallShifts.startsAt, windowEndsAt),
      ),
    )

  let remindersQueued = 0

  for (const candidate of candidates) {
    if (candidate.userId === null) {
      continue
    }

    // The reminders of the shift: how often the office asked already, and when
    // the last one went out.
    const announced = await database
      .select({ state: outbox.state, createdAt: outbox.createdAt })
      .from(outbox)
      .where(
        and(
          eq(outbox.shiftId, candidate.id),
          eq(outbox.eventType, REMINDER_EVENT_TYPE),
        ),
      )
      .orderBy(desc(outbox.createdAt))

    // A row that is still on its way holds the next reminder back: one at a
    // time, so the technician is not flooded.
    if (announced.some((row) => row.state === 'PENDING')) {
      continue
    }

    const reminderNumber = announced.length + 1
    const lastReminder = announced[0]

    if (lastReminder !== undefined) {
      const ageMs = now.getTime() - lastReminder.createdAt.getTime()
      const intervalMs = settings.reminderRepeatH * 60 * 60 * 1000

      if (ageMs < intervalMs) {
        continue
      }
    }

    const userId = candidate.userId ?? ''

    await database.transaction(async (tx) => {
      remindersQueued += await enqueueOncallOutbox(
        tx,
        {
          shift: {
            id: candidate.id,
            poolId: candidate.poolId,
            state: candidate.state,
            startsAt: candidate.startsAt,
            endsAt: candidate.endsAt,
          },
          eventType: REMINDER_EVENT_TYPE,
          userId,
          reminderNumber,
        },
        env,
      )
    })
  }

  return { remindersQueued }
}
