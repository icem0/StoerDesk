import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => {
  class ApiError extends Error {
    readonly status: number
    readonly code?: string

    constructor(options: { status: number; code?: string }) {
      super('API request failed')
      this.name = 'ApiError'
      this.status = options.status
      this.code = options.code
    }
  }

  return { apiFetch: vi.fn(), ApiError }
})

import {
  deliverShiftAction,
  enqueueShiftAction,
  outboxDb,
  queuedShiftActions,
  removeShiftAction,
  replayShiftActions,
  updateShiftAction,
} from '../outbox'
import { apiFetch, ApiError } from '../api'

const fetched = vi.mocked(apiFetch)
const shiftId = '22222222-2222-4222-8222-222222222222'

beforeEach(async () => {
  fetched.mockReset()
  await outboxDb.shift_actions.clear()
})

describe('enqueueShiftAction', () => {
  it('stores a queued row keyed by its own idempotency key', async () => {
    const clientUuid = await enqueueShiftAction({ shiftId, action: 'confirm' })
    const rows = await queuedShiftActions()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.client_uuid).toBe(clientUuid)
    expect(rows[0]?.shift_id).toBe(shiftId)
    expect(rows[0]?.action).toBe('confirm')
    expect(rows[0]?.status).toBe('queued')
    expect(rows[0]?.retries).toBe(0)
    expect(clientUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('stores the decline reason and replays oldest first', async () => {
    const first = await enqueueShiftAction({
      shiftId,
      action: 'decline',
      payload: { reason: 'Krank' },
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await enqueueShiftAction({ shiftId, action: 'confirm' })

    const rows = await queuedShiftActions()

    expect(rows.map((row) => row.client_uuid)).toEqual([first, second])
    expect(rows[0]?.payload).toEqual({ reason: 'Krank' })
  })
})

describe('deliverShiftAction', () => {
  it('sends the client_uuid and removes the row on success', async () => {
    const clientUuid = await enqueueShiftAction({
      shiftId,
      action: 'decline',
      payload: { reason: 'Krank' },
    })
    const [row] = await queuedShiftActions()
    fetched.mockImplementation(async () => undefined)

    expect(await deliverShiftAction(row!)).toBe(true)
    expect(await queuedShiftActions()).toHaveLength(0)
    expect(fetched).toHaveBeenCalledWith(`/v1/oncall/shifts/${shiftId}/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientUuid, reason: 'Krank' }),
    })
  })

  it('keeps a rejected row as conflict with its code', async () => {
    await enqueueShiftAction({ shiftId, action: 'confirm' })
    const [row] = await queuedShiftActions()
    fetched.mockRejectedValue(new ApiError({ status: 409, code: 'oncall_shift_started' }))

    expect(await deliverShiftAction(row!)).toBe(false)

    const [after] = await queuedShiftActions()

    expect(after?.status).toBe('conflict')
    expect(after?.error_code).toBe('oncall_shift_started')
    expect(after?.retries).toBe(0)
  })

  it('marks a network failure failed and counts one retry', async () => {
    await enqueueShiftAction({ shiftId, action: 'confirm' })
    const [row] = await queuedShiftActions()
    fetched.mockRejectedValue(new Error('offline'))

    expect(await deliverShiftAction(row!)).toBe(false)

    const [after] = await queuedShiftActions()

    expect(after?.status).toBe('failed')
    expect(after?.retries).toBe(1)
  })
})

describe('replayShiftActions', () => {
  it('delivers queued and failed rows but never conflict rows', async () => {
    await enqueueShiftAction({ shiftId, action: 'confirm' })
    const rejected = await enqueueShiftAction({ shiftId, action: 'decline' })
    await updateShiftAction(rejected, {
      status: 'conflict',
      error_code: 'oncall_shift_started',
    })
    fetched.mockImplementation(async () => undefined)

    const result = await replayShiftActions()
    const rows = await queuedShiftActions()

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.client_uuid).toBe(rejected)
  })
})

describe('removeShiftAction', () => {
  it('drops a rejected row', async () => {
    const clientUuid = await enqueueShiftAction({ shiftId, action: 'confirm' })
    await removeShiftAction(clientUuid)

    expect(await queuedShiftActions()).toHaveLength(0)
  })
})
