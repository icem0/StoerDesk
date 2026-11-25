import { and, eq, inArray, sql } from 'drizzle-orm'

import { loadEffectivePermissions } from '../auth/requirePermission'
import { loadEnv } from '../config/env'
import type { Database } from '../db/client'
import {
  oncallPools,
  oncallShifts,
  oncallSwapRequests,
  outbox,
  type OnCallShiftState,
} from '../db/schema'
import { enqueueOncallOutbox } from '../notifications/outbox'
import { appendOncallEvent } from './events'
import {
  generateOncallBlockSlots,
  mergeOncallBlocks,
  generateOncallSlots,
  resolveOncallBlocks,
  type OncallBlockPattern,
  type OncallSlot,
} from '@stoerdesk/shared'
import { readOncallSettings } from './settings'

type Db = Database['database']

/** A generated slot: a shift of a block carries its pattern, a shift of the
 * continuous plan covers its whole span and has none. */
type GeneratedSlot = OncallSlot & { pattern?: OncallBlockPattern }

const CREATABLE_STATES = new Set<OnCallShiftState>(['UNFILLED', 'DRAFT', 'PLANNED', 'DECLINED'])

const UPDATABLE_TO = new Set<OnCallShiftState>(['DRAFT', 'PLANNED'])

export class OncallServiceError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'OncallServiceError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export type CreateShiftInput = {
  poolId: string
  userId?: string | null
  publish?: boolean
  startsAt?: Date
  endsAt?: Date
  createdByUserId?: string | null
}

export type GenerateShiftsInput = {
  poolId: string
  from: Date
  to: Date
  createdByUserId?: string | null
}

export type UpdateShiftPatch = {
  userId?: string | null
  publish?: boolean
}

export type ShiftResult = {
  id: string
  poolId: string
  userId: string | null
  state: OnCallShiftState
  startsAt: Date
  endsAt: Date
}

function toShiftResult(row: {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: Date
  endsAt: Date
}): ShiftResult {
  return { ...row, state: row.state as OnCallShiftState }
}

async function requirePool(database: Db, poolId: string) {
  const [pool] = await database
    .select({ id: oncallPools.id, weeklyWindows: oncallPools.weeklyWindows })
    .from(oncallPools)
    .where(eq(oncallPools.id, poolId))
    .limit(1)

  if (pool === undefined) {
    throw new OncallServiceError(404, 'oncall_pool_not_found', { fields: ['poolId'] })
  }

  return pool
}

async function findShift(database: Db, shiftId: string) {
  const [shift] = await database
    .select({
      id: oncallShifts.id,
      poolId: oncallShifts.poolId,
      userId: oncallShifts.userId,
      state: oncallShifts.state,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
      confirmedAt: oncallShifts.confirmedAt,
      declinedAt: oncallShifts.declinedAt,
    })
    .from(oncallShifts)
    .where(eq(oncallShifts.id, shiftId))
    .limit(1)

  return shift
}

/**
 * One `oncall.assigned` announcement per shift **and technician**
 * (`ADR-0021`, WP-M14-29): the allocation is already queued while the row of
 * that technician is still `PENDING` or already `SENT`.
 *
 * The target of the row names its technician (`assignedTo`, WP-M23-08): the
 * guard of a reassignment after a decline asks for the row of the *new*
 * technician, so the announcement reaches him. A row without the field — one
 * written before the change — belongs to nobody and blocks nothing.
 */
async function assignedAnnouncementQueued(
  executor: Pick<Db, 'select'>,
  shiftId: string,
  userId: string,
) {
  const rows = await executor
    .select({ state: outbox.state })
    .from(outbox)
    .where(
      and(
        eq(outbox.shiftId, shiftId),
        eq(outbox.eventType, 'oncall.assigned'),
        inArray(outbox.state, ['PENDING', 'SENT']),
        sql`${outbox.target}->>'assignedTo' = ${userId}`,
      ),
    )

  return rows.length > 0
}

/**
 * Creates one shift. Without a technician the slot is `UNFILLED`, with a
 * technician it is `DRAFT`, and with `publish` it is `PLANNED`.
 * Writes one `shift_created` event in the same transaction.
 */
export async function createShift(database: Db, input: CreateShiftInput): Promise<ShiftResult> {
  const { poolId, userId, publish, startsAt, endsAt, createdByUserId } = input

  await requirePool(database, poolId)

  let state: OnCallShiftState

  if (userId === undefined || userId === null) {
    state = 'UNFILLED'
  } else if (publish === true) {
    state = 'PLANNED'
  } else {
    state = 'DRAFT'
  }

  const now = new Date()
  const slotStart = startsAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const slotEnd = endsAt ?? new Date(slotStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  return await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(oncallShifts)
      .values({
        poolId,
        userId: userId ?? null,
        state,
        startsAt: slotStart,
        endsAt: slotEnd,
        createdByUserId: createdByUserId ?? null,
      })
      .returning({
        id: oncallShifts.id,
        poolId: oncallShifts.poolId,
        userId: oncallShifts.userId,
        state: oncallShifts.state,
        startsAt: oncallShifts.startsAt,
        endsAt: oncallShifts.endsAt,
      })

    if (created === undefined) {
      throw new OncallServiceError(500, 'shift_create_failed', {})
    }

    await appendOncallEvent(tx, {
      shiftId: created.id,
      type: 'shift_created',
      actorUserId: createdByUserId ?? null,
      payload: { poolId, userId: userId ?? null, state },
    })

    if (
      userId !== undefined &&
      userId !== null &&
      !(await assignedAnnouncementQueued(tx, created.id, userId))
    ) {
      await enqueueOncallOutbox(
        tx,
        {
          shift: {
            id: created.id,
            poolId: created.poolId,
            state: created.state,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
          eventType: 'oncall.assigned',
          userId,
        },
        loadEnv(),
      )
    }

    return toShiftResult(created)
  })
}

/**
 * Generates slots for one pool over `[from, to)` using the resolved on-call
 * settings and inserts them idempotently (`ON CONFLICT (pool_id, starts_at)
 * DO NOTHING`). Returns `{ created, skipped }` and never moves an existing slot.
 */
export async function generateShifts(
  database: Db,
  input: GenerateShiftsInput,
): Promise<{ created: number; skipped: number }> {
  const { poolId, from, to, createdByUserId } = input

  const pool = await requirePool(database, poolId)

  const settings = await readOncallSettings(database)

  // The window plan (`specs/04-oncall.md` §4a.3.3, ADR-0040) belongs to the
  // pool and creates one shift per duty block; a stored day window of
  // ADR-0035 reads as a block of one day. Without a block the continuous plan
  // of ADR-0011 is the plan.
  //
  // The plan is normalised (`specs/04-oncall.md` §4a.3.4, ADR-0044): blocks
  // with the same daily window on consecutive weekdays become one block, so a
  // pool of the older version creates one shift per week and not one per day.
  const blocks = mergeOncallBlocks(resolveOncallBlocks(pool.weeklyWindows))

  const slots: GeneratedSlot[] =
    blocks.length > 0
      ? generateOncallBlockSlots({ from, to, blocks })
      : generateOncallSlots({
          from,
          to,
          weekStartWeekday: settings.weekStartWeekday,
          startTime: settings.startTime,
          durationDays: settings.durationDays,
        })

  if (slots.length === 0) {
    return { created: 0, skipped: 0 }
  }

  return await database.transaction(async (tx) => {
    const inserted = await tx
      .insert(oncallShifts)
      .values(
        slots.map((slot) => ({
          poolId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          state: 'UNFILLED',
          createdByUserId: createdByUserId ?? null,
          // A shift of a block carries its pattern; a shift of the continuous
          // plan covers its whole span and has none.
          ...(slot.pattern === undefined
            ? {}
            : {
                weekdays: slot.pattern.weekdays.join(','),
                dailyStart: slot.pattern.dailyStart,
                dailyEnd: slot.pattern.dailyEnd,
              }),
        })),
      )
      .onConflictDoNothing({
        target: [oncallShifts.poolId, oncallShifts.startsAt],
      })
      .returning({ id: oncallShifts.id })

    return {
      created: inserted.length,
      skipped: slots.length - inserted.length,
    }
  })
}

/**
 * Whether the user holds the right of the readiness office (`oncall.admin`).
 * The handover of a confirmed shift belongs to them alone (WP-M23-10).
 */
async function isAdmin(database: Db, userId: string): Promise<boolean> {
  const permissions = await loadEffectivePermissions(database, userId)

  return permissions.includes('oncall.admin')
}

/**
 * Assigns, publishes or reassigns a shift following the §4a.3 transitions:
 * `UNFILLED / DRAFT / PLANNED / DECLINED → DRAFT | PLANNED` and
 * `DRAFT → PLANNED`. Clears `declined_at` on assign/reassign.
 *
 * The handover (WP-M23-10): an admin may reassign a `CONFIRMED` or a
 * `SWAP_REQUESTED` shift — `PLAN.md` §8 and §4a.3 promise it. The shift goes
 * to `PLANNED` with the new technician, so it counts for the coupling again and
 * the new technician has to accept it. The reassign of a `SWAP_REQUESTED`
 * shift cancels the open swap and writes `swap_cancelled` (§4a.3).
 */
export async function updateShift(
  database: Db,
  shiftId: string,
  patch: UpdateShiftPatch,
  actorUserId: string,
): Promise<ShiftResult> {
  const shift = await findShift(database, shiftId)

  if (shift === undefined) {
    throw new OncallServiceError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  const fromState = shift.state as OnCallShiftState
  let toState: OnCallShiftState | undefined

  if (patch.userId !== undefined) {
    toState = patch.publish === true ? 'PLANNED' : 'DRAFT'
  } else if (patch.publish === true) {
    toState = 'PLANNED'
  }

  if (toState === undefined) {
    return toShiftResult(shift)
  }

  // The handover of the admin: a confirmed or swapped shift goes back to
  // `PLANNED` with the new technician (WP-M23-10) — it counts for the coupling
  // again and the new technician has to accept it.
  const handover =
    patch.userId !== undefined &&
    (fromState === 'CONFIRMED' || fromState === 'SWAP_REQUESTED')

  if (handover) {
    // The handover belongs to the admin alone (WP-M23-10): the route is
    // guarded by `oncall.admin`, the service checks it again so the rule holds
    // whoever calls the function.
    if (!(await isAdmin(database, actorUserId))) {
      throw new OncallServiceError(403, 'forbidden', { fields: ['shiftId'] })
    }

    toState = 'PLANNED'
  }

  if (!handover && (!CREATABLE_STATES.has(fromState) || !UPDATABLE_TO.has(toState))) {
    throw new OncallServiceError(409, 'oncall_shift_invalid_transition', {
      shiftId,
      from: fromState,
      to: toState!,
    })
  }

  if (fromState === toState && patch.userId === shift.userId) {
    return toShiftResult(shift)
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallShifts)
      .set({
        state: toState!,
        userId: patch.userId !== undefined ? patch.userId : shift.userId,
        declinedAt:
          patch.userId !== undefined || toState !== 'DECLINED' ? null : (shift.declinedAt ?? null),
        updatedAt: new Date(),
      })
      .where(eq(oncallShifts.id, shiftId))
      .returning({
        id: oncallShifts.id,
        poolId: oncallShifts.poolId,
        userId: oncallShifts.userId,
        state: oncallShifts.state,
        startsAt: oncallShifts.startsAt,
        endsAt: oncallShifts.endsAt,
      })

    if (updated === undefined) {
      throw new OncallServiceError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.id,
      type: 'shift_updated',
      actorUserId,
      payload: {
        from: fromState,
        to: toState,
        userId: patch.userId,
        publish: patch.publish,
      },
    })

    // The handover of a swapped shift cancels the open swap (§4a.3): the swap
    // is answered by the reassignment itself.
    if (handover && fromState === 'SWAP_REQUESTED') {
      await tx
        .update(oncallSwapRequests)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(
          and(
            eq(oncallSwapRequests.shiftId, updated.id),
            inArray(oncallSwapRequests.status, ['PENDING', 'ACCEPTED']),
          ),
        )

      await appendOncallEvent(tx, {
        shiftId: updated.id,
        type: 'swap_cancelled',
        actorUserId,
        payload: { cancelledByUserId: actorUserId },
      })
    }

    if (
      patch.userId !== undefined &&
      patch.userId !== null &&
      !(await assignedAnnouncementQueued(tx, updated.id, patch.userId))
    ) {
      await enqueueOncallOutbox(
        tx,
        {
          shift: {
            id: updated.id,
            poolId: updated.poolId,
            state: updated.state,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
          eventType: 'oncall.assigned',
          userId: patch.userId,
        },
        loadEnv(),
      )
    }

    return toShiftResult(updated)
  })
}

/**
 * Deletes a shift (ADR-0047, `specs/04-oncall.md` §4a.3).
 *
 * A shift that held the duty stays locked: a confirmed or swapped shift, and
 * every shift that was confirmed at some moment — also when it was declined
 * afterwards, the confirmation stays in the row. A shift that was never
 * confirmed may be deleted even after it started: the office removes the slots
 * that nobody accepted. A `PLANNED` shift that started stays locked, because
 * it counted for the ticket coupling (§4a.6) and the office may have offered a
 * ticket on it. Every other lock answers `409 oncall_shift_locked` with the
 * reason in its params.
 */
export async function deleteShift(
  database: Db,
  shiftId: string,
  actorUserId: string,
): Promise<void> {
  const shift = await findShift(database, shiftId)

  if (shift === undefined) {
    throw new OncallServiceError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (shift.state === 'CONFIRMED' || shift.state === 'SWAP_REQUESTED') {
    throw new OncallServiceError(409, 'oncall_shift_locked', {
      shiftId,
      state: shift.state,
      reason: 'state',
    })
  }

  // The duty the shift held stays part of the history — also when the
  // technician declined afterwards (`confirmed_at` is set then).
  if (shift.confirmedAt !== null) {
    throw new OncallServiceError(409, 'oncall_shift_locked', {
      shiftId,
      state: shift.state,
      reason: 'confirmed',
    })
  }

  if (shift.startsAt <= new Date() && shift.state === 'PLANNED') {
    throw new OncallServiceError(409, 'oncall_shift_locked', {
      shiftId,
      state: shift.state,
      reason: 'started',
    })
  }

  await database.transaction(async (tx) => {
    await appendOncallEvent(tx, {
      shiftId,
      type: 'shift_deleted',
      actorUserId,
      payload: { state: shift.state },
    })

    const deleted = await tx
      .delete(oncallShifts)
      .where(eq(oncallShifts.id, shiftId))
      .returning({ id: oncallShifts.id })

    if (deleted.length === 0) {
      throw new OncallServiceError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }
  })
}

export type { OnCallShiftState }
