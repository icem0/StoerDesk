import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import {
  oncallPools,
  oncallShifts,
  type OnCallShiftState,
} from '../db/schema'
import { appendOncallEvent } from './events'
import { generateOncallSlots } from '@stoerdesk/shared'
import { readOncallSettings } from './settings'

type Db = Database['database']

const CREATABLE_STATES = new Set<OnCallShiftState>([
  'UNFILLED',
  'DRAFT',
  'PLANNED',
  'DECLINED',
])

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
    .select({ id: oncallPools.id })
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
      declinedAt: oncallShifts.declinedAt,
    })
    .from(oncallShifts)
    .where(eq(oncallShifts.id, shiftId))
    .limit(1)

  return shift
}

/**
 * Creates one shift. Without a technician the slot is `UNFILLED`, with a
 * technician it is `DRAFT`, and with `publish` it is `PLANNED`.
 * Writes one `shift_created` event in the same transaction.
 */
export async function createShift(
  database: Db,
  input: CreateShiftInput,
): Promise<ShiftResult> {
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

  await requirePool(database, poolId)

  const settings = await readOncallSettings(database)

  const slots = generateOncallSlots({
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
 * Assigns, publishes or reassigns a shift following the §4a.3 transitions:
 * `UNFILLED / DRAFT / PLANNED / DECLINED → DRAFT | PLANNED` and
 * `DRAFT → PLANNED`. Clears `declined_at` on assign/reassign.
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

  if (!CREATABLE_STATES.has(fromState) || !UPDATABLE_TO.has(toState)) {
    throw new OncallServiceError(
      409,
      'oncall_shift_invalid_transition',
      { shiftId, from: fromState, to: toState! },
    )
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
          patch.userId !== undefined || toState !== 'DECLINED'
            ? null
            : shift.declinedAt ?? null,
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

    return toShiftResult(updated)
  })
}

/**
 * Deletes a shift only while it is not `CONFIRMED`/`SWAP_REQUESTED` and has not
 * started yet. Otherwise answers `409 oncall_shift_locked`.
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
    throw new OncallServiceError(409, 'oncall_shift_locked', { shiftId, state: shift.state })
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallServiceError(409, 'oncall_shift_locked', { shiftId, reason: 'started' })
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
