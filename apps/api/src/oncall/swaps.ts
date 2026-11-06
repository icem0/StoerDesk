import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import {
  oncallPools,
  oncallShifts,
  oncallSwapRequests,
  roles,
  type OnCallShiftState,
  userGroups,
  userRoles,
  users,
} from '../db/schema'
import { appendOncallEvent } from './events'
import { readOncallSettings } from './settings'
import { loadEffectivePermissions } from '../auth/requirePermission'

type Db = Database['database']

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

const REQUESTABLE_STATES = new Set<OnCallShiftState>(['CONFIRMED'])
const CLOSEABLE_STATES = new Set(['PENDING', 'ACCEPTED'])

export class OncallSwapError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'OncallSwapError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export type SwapResult = {
  id: string
  shiftId: string
  status: string
  requestedByUserId: string | null
  targetUserId: string | null
  acceptedByUserId: string | null
  acceptedAt: Date | null
  approvedByUserId: string | null
  approvedAt: Date | null
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
    })
    .from(oncallShifts)
    .where(eq(oncallShifts.id, shiftId))
    .limit(1)

  return shift
}

async function findSwap(database: Db, swapId: string) {
  const [swap] = await database
    .select({
      id: oncallSwapRequests.id,
      shiftId: oncallSwapRequests.shiftId,
      requestedByUserId: oncallSwapRequests.requestedByUserId,
      targetUserId: oncallSwapRequests.targetUserId,
      status: oncallSwapRequests.status,
      acceptedByUserId: oncallSwapRequests.acceptedByUserId,
      acceptedAt: oncallSwapRequests.acceptedAt,
      approvedByUserId: oncallSwapRequests.approvedByUserId,
      approvedAt: oncallSwapRequests.approvedAt,
    })
    .from(oncallSwapRequests)
    .where(eq(oncallSwapRequests.id, swapId))
    .limit(1)

  return swap
}

async function isAdmin(database: Db, userId: string): Promise<boolean> {
  const permissions = await loadEffectivePermissions(database, userId)

  return permissions.includes('oncall.admin')
}

async function poolMembers(database: Db, poolId: string): Promise<Set<string>> {
  const [pool] = await database
    .select({ id: oncallPools.id, groupId: oncallPools.groupId })
    .from(oncallPools)
    .where(eq(oncallPools.id, poolId))
    .limit(1)

  if (pool === undefined) {
    throw new OncallSwapError(404, 'oncall_pool_not_found', { fields: ['poolId'] })
  }

  const members = new Set<string>()

  if (pool.groupId !== null && pool.groupId !== undefined) {
    const rows = await database
      .select({ userId: userGroups.userId })
      .from(userGroups)
      .innerJoin(users, eq(users.id, userGroups.userId))
      .where(
        and(
          eq(userGroups.groupId, pool.groupId),
          eq(users.active, true),
        ),
      )

    for (const row of rows) {
      members.add(row.userId)
    }
  } else {
    const rows = await database
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(
          eq(roles.key, 'oncall'),
          eq(users.active, true),
        ),
      )

    for (const row of rows) {
      members.add(row.userId)
    }
  }

  return members
}

async function loadSwapRequiresAdminApproval(database: Db): Promise<boolean> {
  const settings = await readOncallSettings(database)

  return settings.swapRequiresAdminApproval === true
}

function toSwapResult(row: {
  id: string
  shiftId: string
  status: string
  requestedByUserId: string | null
  targetUserId: string | null
  acceptedByUserId: string | null
  acceptedAt: Date | null
  approvedByUserId: string | null
  approvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): SwapResult {
  return row
}

/**
 * Requests a swap for a confirmed shift that has not started yet. Only the
 * assigned technician may request. `targetUserId` must be a pool member and not
 * the requester. The shift moves to `SWAP_REQUESTED`; one pending request per
 * shift is enforced by the partial unique index (`409 swap_already_open`).
 */
export async function requestSwap(
  database: Db,
  input: { shiftId: string; actorUserId: string; targetUserId?: string | null },
): Promise<{ swap: SwapResult }> {
  const { shiftId, actorUserId, targetUserId } = input

  const shift = await findShift(database, shiftId)

  if (shift === undefined) {
    throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (shift.userId === null || shift.userId !== actorUserId) {
    throw new OncallSwapError(403, 'forbidden', {})
  }

  if (!REQUESTABLE_STATES.has(shift.state as 'CONFIRMED')) {
    throw new OncallSwapError(409, 'oncall_invalid_shift_state', {
      shiftId,
      from: shift.state,
      to: 'SWAP_REQUESTED',
    })
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallSwapError(409, 'oncall_shift_started', { shiftId })
  }

  if (targetUserId !== undefined && targetUserId !== null && targetUserId === actorUserId) {
    throw new OncallSwapError(403, 'forbidden', { fields: ['targetUserId'] })
  }

  const members = await poolMembers(database, shift.poolId)

  if (targetUserId !== undefined && targetUserId !== null && !members.has(targetUserId)) {
    throw new OncallSwapError(403, 'forbidden', { fields: ['targetUserId'] })
  }

  return await database.transaction(async (tx) => {
    let created: SwapResult | undefined = undefined

    try {
      ;[created] = await tx
        .insert(oncallSwapRequests)
        .values({
          shiftId,
          requestedByUserId: actorUserId,
          targetUserId: targetUserId ?? null,
          status: 'PENDING',
        })
        .returning({
          id: oncallSwapRequests.id,
          shiftId: oncallSwapRequests.shiftId,
          requestedByUserId: oncallSwapRequests.requestedByUserId,
          targetUserId: oncallSwapRequests.targetUserId,
          status: oncallSwapRequests.status,
          acceptedByUserId: oncallSwapRequests.acceptedByUserId,
          acceptedAt: oncallSwapRequests.acceptedAt,
          approvedByUserId: oncallSwapRequests.approvedByUserId,
          approvedAt: oncallSwapRequests.approvedAt,
          createdAt: oncallSwapRequests.createdAt,
          updatedAt: oncallSwapRequests.updatedAt,
        })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OncallSwapError(409, 'swap_already_open', { shiftId })
      }

      throw error
    }

    if (created === undefined) {
      throw new OncallSwapError(409, 'swap_already_open', { shiftId })
    }

    const [updated] = await tx
      .update(oncallShifts)
      .set({ state: 'SWAP_REQUESTED', updatedAt: new Date() })
      .where(eq(oncallShifts.id, shiftId))
      .returning({ id: oncallShifts.id })

    if (updated === undefined) {
      throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.id,
      type: 'swap_requested',
      actorUserId,
      payload: { targetUserId: targetUserId ?? null },
    })

    return { swap: toSwapResult(created) }
  })
}

/**
 * Atomically accepts a `PENDING` swap request: `UPDATE … WHERE status =
 * 'PENDING'` so exactly one concurrent acceptance wins (`409 swap_taken`).
 * With `swap_requires_admin_approval` the request becomes `ACCEPTED` and the
 * shift keeps its original technician; otherwise it becomes `APPROVED`, the
 * shift moves to `CONFIRMED` with the accepting user, effective immediately.
 */
export async function acceptSwap(
  database: Db,
  input: { swapId: string; actorUserId: string },
): Promise<{ swap: SwapResult; shiftChanged: boolean }> {
  const { swapId, actorUserId } = input

  const swap = await findSwap(database, swapId)

  if (swap === undefined) {
    throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
  }

  if (swap.status !== 'PENDING') {
    throw new OncallSwapError(409, 'swap_not_pending', { swapId, status: swap.status })
  }

  const shift = await findShift(database, swap.shiftId)

  if (shift === undefined) {
    throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallSwapError(409, 'oncall_shift_started', { shiftId: swap.shiftId })
  }

  const members = await poolMembers(database, shift.poolId)

  if (!members.has(actorUserId)) {
    throw new OncallSwapError(403, 'forbidden', {})
  }

  if (actorUserId === swap.requestedByUserId) {
    throw new OncallSwapError(403, 'forbidden', { fields: ['actorUserId'] })
  }

  const requiresAdminApproval = await loadSwapRequiresAdminApproval(database)

  return await database.transaction(async (tx) => {
    const [accepted] = await tx
      .update(oncallSwapRequests)
      .set({
        status: 'ACCEPTED',
        acceptedByUserId: actorUserId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(oncallSwapRequests.id, swapId), eq(oncallSwapRequests.status, 'PENDING')))
      .returning({
        id: oncallSwapRequests.id,
        shiftId: oncallSwapRequests.shiftId,
        requestedByUserId: oncallSwapRequests.requestedByUserId,
        targetUserId: oncallSwapRequests.targetUserId,
        status: oncallSwapRequests.status,
        acceptedByUserId: oncallSwapRequests.acceptedByUserId,
        acceptedAt: oncallSwapRequests.acceptedAt,
        approvedByUserId: oncallSwapRequests.approvedByUserId,
        approvedAt: oncallSwapRequests.approvedAt,
        createdAt: oncallSwapRequests.createdAt,
        updatedAt: oncallSwapRequests.updatedAt,
      })

    if (accepted === undefined) {
      throw new OncallSwapError(409, 'swap_taken', { swapId })
    }

    let shiftChanged = false

    if (requiresAdminApproval === true) {
      await appendOncallEvent(tx, {
        shiftId: accepted.shiftId,
        type: 'swap_accepted',
        actorUserId,
        payload: { acceptedByUserId: actorUserId },
      })
    } else {
      const [updated] = await tx
        .update(oncallShifts)
        .set({ state: 'CONFIRMED', userId: actorUserId, updatedAt: new Date() })
        .where(eq(oncallShifts.id, accepted.shiftId))
        .returning({ id: oncallShifts.id })

      if (updated === undefined) {
        throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
      }

      shiftChanged = true

      await appendOncallEvent(tx, {
        shiftId: accepted.shiftId,
        type: 'swap_approved',
        actorUserId,
        payload: { acceptedByUserId: actorUserId, userId: actorUserId },
      })
    }

    return { swap: toSwapResult(accepted), shiftChanged }
  })
}

/**
 * Admin approval of an `ACCEPTED` swap: moves the request to `APPROVED`, sets
 * the shift to `CONFIRMED` with the accepting candidate and returns it to
 * `CONFIRMED`.
 */
export async function approveSwap(
  database: Db,
  input: { swapId: string; actorUserId: string },
): Promise<{ swap: SwapResult }> {
  const { swapId, actorUserId } = input

  if (!(await isAdmin(database, actorUserId))) {
    throw new OncallSwapError(403, 'forbidden', {})
  }

  const swap = await findSwap(database, swapId)

  if (swap === undefined) {
    throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
  }

  if (swap.status !== 'ACCEPTED') {
    throw new OncallSwapError(409, 'swap_not_accepted', { swapId, status: swap.status })
  }

  const shift = await findShift(database, swap.shiftId)

  if (shift === undefined) {
    throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  if (shift.startsAt <= new Date()) {
    throw new OncallSwapError(409, 'oncall_shift_started', { shiftId: swap.shiftId })
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallSwapRequests)
      .set({
        status: 'APPROVED',
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(oncallSwapRequests.id, swapId))
      .returning({
        id: oncallSwapRequests.id,
        shiftId: oncallSwapRequests.shiftId,
        requestedByUserId: oncallSwapRequests.requestedByUserId,
        targetUserId: oncallSwapRequests.targetUserId,
        status: oncallSwapRequests.status,
        acceptedByUserId: oncallSwapRequests.acceptedByUserId,
        acceptedAt: oncallSwapRequests.acceptedAt,
        approvedByUserId: oncallSwapRequests.approvedByUserId,
        approvedAt: oncallSwapRequests.approvedAt,
        createdAt: oncallSwapRequests.createdAt,
        updatedAt: oncallSwapRequests.updatedAt,
      })

    if (updated === undefined) {
      throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
    }

    const [shiftRow] = await tx
      .update(oncallShifts)
      .set({ state: 'CONFIRMED', userId: acceptedUserId(updated), updatedAt: new Date() })
      .where(eq(oncallShifts.id, updated.shiftId))
      .returning({ id: oncallShifts.id })

    if (shiftRow === undefined) {
      throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.shiftId,
      type: 'swap_approved',
      actorUserId,
      payload: { approvedByUserId: actorUserId, userId: acceptedUserId(updated) },
    })

    return { swap: toSwapResult(updated) }
  })
}

/**
 * Admin rejection of a `PENDING` or `ACCEPTED` swap: moves the request to
 * `DECLINED` and returns the shift to `CONFIRMED` with the original technician.
 */
export async function rejectSwap(
  database: Db,
  input: { swapId: string; actorUserId: string },
): Promise<{ swap: SwapResult }> {
  const { swapId, actorUserId } = input

  if (!(await isAdmin(database, actorUserId))) {
    throw new OncallSwapError(403, 'forbidden', {})
  }

  const swap = await findSwap(database, swapId)

  if (swap === undefined) {
    throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
  }

  if (!CLOSEABLE_STATES.has(swap.status)) {
    throw new OncallSwapError(409, 'swap_not_pending', { swapId, status: swap.status })
  }

  const shift = await findShift(database, swap.shiftId)

  if (shift === undefined) {
    throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallSwapRequests)
      .set({ status: 'DECLINED', updatedAt: new Date() })
      .where(eq(oncallSwapRequests.id, swapId))
      .returning({
        id: oncallSwapRequests.id,
        shiftId: oncallSwapRequests.shiftId,
        requestedByUserId: oncallSwapRequests.requestedByUserId,
        targetUserId: oncallSwapRequests.targetUserId,
        status: oncallSwapRequests.status,
        acceptedByUserId: oncallSwapRequests.acceptedByUserId,
        acceptedAt: oncallSwapRequests.acceptedAt,
        approvedByUserId: oncallSwapRequests.approvedByUserId,
        approvedAt: oncallSwapRequests.approvedAt,
        createdAt: oncallSwapRequests.createdAt,
        updatedAt: oncallSwapRequests.updatedAt,
      })

    if (updated === undefined) {
      throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
    }

    const [shiftRow] = await tx
      .update(oncallShifts)
      .set({ state: 'CONFIRMED', userId: shift.userId, updatedAt: new Date() })
      .where(eq(oncallShifts.id, updated.shiftId))
      .returning({ id: oncallShifts.id })

    if (shiftRow === undefined) {
      throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.shiftId,
      type: 'swap_rejected',
      actorUserId,
      payload: { rejectedByUserId: actorUserId },
    })

    return { swap: toSwapResult(updated) }
  })
}

/**
 * Cancellation of a `PENDING` or `ACCEPTED` swap by the requester or an admin:
 * moves the request to `CANCELLED` and returns the shift to `CONFIRMED` with the
 * original technician.
 */
export async function cancelSwap(
  database: Db,
  input: { swapId: string; actorUserId: string },
): Promise<{ swap: SwapResult }> {
  const { swapId, actorUserId } = input

  const swap = await findSwap(database, swapId)

  if (swap === undefined) {
    throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
  }

  if (!CLOSEABLE_STATES.has(swap.status)) {
    throw new OncallSwapError(409, 'swap_not_pending', { swapId, status: swap.status })
  }

  if (swap.requestedByUserId !== actorUserId && !(await isAdmin(database, actorUserId))) {
    throw new OncallSwapError(403, 'forbidden', {})
  }

  const shift = await findShift(database, swap.shiftId)

  if (shift === undefined) {
    throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(oncallSwapRequests)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(oncallSwapRequests.id, swapId))
      .returning({
        id: oncallSwapRequests.id,
        shiftId: oncallSwapRequests.shiftId,
        requestedByUserId: oncallSwapRequests.requestedByUserId,
        targetUserId: oncallSwapRequests.targetUserId,
        status: oncallSwapRequests.status,
        acceptedByUserId: oncallSwapRequests.acceptedByUserId,
        acceptedAt: oncallSwapRequests.acceptedAt,
        approvedByUserId: oncallSwapRequests.approvedByUserId,
        approvedAt: oncallSwapRequests.approvedAt,
        createdAt: oncallSwapRequests.createdAt,
        updatedAt: oncallSwapRequests.updatedAt,
      })

    if (updated === undefined) {
      throw new OncallSwapError(404, 'oncall_swap_request_not_found', { fields: ['id'] })
    }

    const [shiftRow] = await tx
      .update(oncallShifts)
      .set({ state: 'CONFIRMED', userId: shift.userId, updatedAt: new Date() })
      .where(eq(oncallShifts.id, updated.shiftId))
      .returning({ id: oncallShifts.id })

    if (shiftRow === undefined) {
      throw new OncallSwapError(404, 'oncall_shift_not_found', { fields: ['id'] })
    }

    await appendOncallEvent(tx, {
      shiftId: updated.shiftId,
      type: 'swap_cancelled',
      actorUserId,
      payload: { cancelledByUserId: actorUserId },
    })

    return { swap: toSwapResult(updated) }
  })
}

function acceptedUserId(row: {
  acceptedByUserId: string | null
}): string | null {
  return row.acceptedByUserId
}

export type { OnCallShiftState } from '../db/schema'
