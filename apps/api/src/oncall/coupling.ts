import { and, asc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallPools, oncallShifts, ticketEvents, tickets } from '../db/schema'
import { TicketTransitionError } from '../tickets/workflow'
import { readOncallSettings } from './settings'

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
const COUPLING_STATES = ['CONFIRMED', 'SWAP_REQUESTED', 'PLANNED'] as const

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
      endsAt: oncallShifts.endsAt,
    })
    .from(oncallShifts)
    .where(
      and(
        eq(oncallShifts.poolId, poolId),
        inArray(oncallShifts.state, COUPLING_STATES),
        lte(oncallShifts.startsAt, at),
        gt(oncallShifts.endsAt, at),
      ),
    )
    .orderBy(asc(oncallShifts.startsAt))

  const confirmed = rows.find(
    (row) => row.state === 'CONFIRMED' || row.state === 'SWAP_REQUESTED',
  )
  const planned = rows.find((row) => row.state === 'PLANNED')
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
