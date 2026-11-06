import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallEvents, oncallShifts, type OnCallShiftState } from '../db/schema'
import { appendOncallEvent } from './events'
import { loadEffectivePermissions } from '../auth/requirePermission'

type Db = Database['database']

const CONFIRMABLE_STATES = new Set<OnCallShiftState>(['PLANNED'])
const DECLINEABLE_STATES = new Set<OnCallShiftState>(['PLANNED', 'CONFIRMED'])

export class OncallConfirmError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'OncallConfirmError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export type ShiftActionResult = {
  id: string
  poolId: string
  userId: string | null
  state: OnCallShiftState
  startsAt: Date
  endsAt: Date
  confirmedAt: Date | null
  declinedAt: Date | null
  createdAt: Date
  updatedAt: Date
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
      createdAt: oncallShifts.createdAt,
      updatedAt: oncallShifts.updatedAt,
    })
    .from(oncallShifts)
    .where(eq(oncallShifts.id, shiftId))
    .limit(1)

  return shift
}

async function isAdmin(database: Db, userId: string): Promise<boolean> {
  const permissions = await loadEffectivePermissions(database, userId)

  return permissions.includes('oncall.admin')
}

function toResult(shift: {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: Date
  endsAt: Date
  confirmedAt: Date | null
  declinedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ShiftActionResult {
  return { ...shift, state: shift.state as OnCallShiftState }
}

function requireAssignedOrAdmin(
  shift: { userId: string | null },
  actorUserId: string,
  database: Db,
): Promise<boolean> {
  if (shift.userId === null || shift.userId === actorUserId) {
    return Promise.resolve(true)
  }

  return isAdmin(database, actorUserId)
}

async function hasReplay(database: Db, shiftId: string, clientUuid: string): Promise<boolean> {
  const [existing] = await database
    .select({ id: oncallEvents.id })
    .from(oncallEvents)
    .where(and(eq(oncallEvents.shiftId, shiftId), eq(oncallEvents.clientUuid, clientUuid)))
    .limit(1)

  return existing !== undefined
}

/**
 * Confirms a `PLANNED` shift. Only the assigned technician or an admin may act.
 * Sets `state = CONFIRMED` and `confirmed_at` and writes one `confirmed`
 * `oncall_events` row in the same transaction. A repeated `clientUuid` answers
 * with the current shift and writes no second event.
 */
export async function confirmShift(
  database: Db,
  input: { shiftId: string; actorUserId: string; clientUuid?: string | null },
): Promise<{ replayed: boolean; shift: ShiftActionResult }> {
  const { shiftId, actorUserId, clientUuid } = input

  const shift = await findShift(database, shiftId)

  if (shift === undefined) {
    throw new OncallConfirmError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (!(await requireAssignedOrAdmin(shift, actorUserId, database))) {
    throw new OncallConfirmError(403, 'forbidden', {})
  }

  if (clientUuid !== undefined && clientUuid !== null) {
    if (await hasReplay(database, shiftId, clientUuid)) {
      return { replayed: true, shift: toResult(shift) }
    }
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallConfirmError(409, 'oncall_shift_started', { shiftId })
  }

  if (!CONFIRMABLE_STATES.has(shift.state as OnCallShiftState)) {
    throw new OncallConfirmError(409, 'oncall_invalid_shift_state', {
      shiftId,
      from: shift.state,
      to: 'CONFIRMED',
    })
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallShifts)
      .set({ state: 'CONFIRMED', confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(oncallShifts.id, shiftId))
      .returning({
        id: oncallShifts.id,
        poolId: oncallShifts.poolId,
        userId: oncallShifts.userId,
        state: oncallShifts.state,
        startsAt: oncallShifts.startsAt,
        endsAt: oncallShifts.endsAt,
        confirmedAt: oncallShifts.confirmedAt,
        declinedAt: oncallShifts.declinedAt,
        createdAt: oncallShifts.createdAt,
        updatedAt: oncallShifts.updatedAt,
      })

    if (updated === undefined) {
      throw new OncallConfirmError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.id,
      type: 'confirmed',
      actorUserId,
      payload: {},
      clientUuid: clientUuid ?? null,
    })

    return { replayed: false, shift: toResult(updated) }
  })
}

/**
 * Declines a `PLANNED` or `CONFIRMED` shift before it started. A reason of
 * 5–500 characters is mandatory. Sets `state = DECLINED` and `declined_at` and
 * writes one `declined` `oncall_events` row in the same transaction. A repeated
 * `clientUuid` answers with the current shift and writes no second event.
 */
export async function declineShift(
  database: Db,
  input: { shiftId: string; actorUserId: string; reason: string; clientUuid?: string | null },
): Promise<{ replayed: boolean; shift: ShiftActionResult }> {
  const { shiftId, actorUserId, reason, clientUuid } = input

  const shift = await findShift(database, shiftId)

  if (shift === undefined) {
    throw new OncallConfirmError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (!(await requireAssignedOrAdmin(shift, actorUserId, database))) {
    throw new OncallConfirmError(403, 'forbidden', {})
  }

  if (clientUuid !== undefined && clientUuid !== null) {
    if (await hasReplay(database, shiftId, clientUuid)) {
      return { replayed: true, shift: toResult(shift) }
    }
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallConfirmError(409, 'oncall_shift_started', { shiftId })
  }

  if (!DECLINEABLE_STATES.has(shift.state as OnCallShiftState)) {
    throw new OncallConfirmError(409, 'oncall_invalid_shift_state', {
      shiftId,
      from: shift.state,
      to: 'DECLINED',
    })
  }

  const trimmedReason = reason.trim()

  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new OncallConfirmError(422, 'oncall_decline_reason_required', { fields: ['reason'] })
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallShifts)
      .set({ state: 'DECLINED', declinedAt: new Date(), updatedAt: new Date() })
      .where(eq(oncallShifts.id, shiftId))
      .returning({
        id: oncallShifts.id,
        poolId: oncallShifts.poolId,
        userId: oncallShifts.userId,
        state: oncallShifts.state,
        startsAt: oncallShifts.startsAt,
        endsAt: oncallShifts.endsAt,
        confirmedAt: oncallShifts.confirmedAt,
        declinedAt: oncallShifts.declinedAt,
        createdAt: oncallShifts.createdAt,
        updatedAt: oncallShifts.updatedAt,
      })

    if (updated === undefined) {
      throw new OncallConfirmError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.id,
      type: 'declined',
      actorUserId,
      payload: { reason: trimmedReason },
      clientUuid: clientUuid ?? null,
    })

    return { replayed: false, shift: toResult(updated) }
  })
}

export type { OnCallShiftState }
