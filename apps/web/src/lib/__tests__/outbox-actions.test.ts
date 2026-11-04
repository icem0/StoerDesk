import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deliverAction,
  enqueueInternalAction,
  pendingWrites,
  queuedActions,
  removeAction,
  updateAction,
  outboxDb,
  replayInternalActions,
} from '../outbox'

/**
 * Internal action queue of WP-M5-01: the Dexie v2 `internal_actions` table,
 * the oldest-first order and the delivery status rules. The API base module is
 * stubbed — the endpoint itself is WP-M5-04.
 */

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

import { apiFetch } from '../api'

const fetched = vi.mocked(apiFetch)

beforeEach(async () => {
  fetched.mockReset()
  await outboxDb.internal_actions.clear()
  await outboxDb.outbox.clear()
})

describe('enqueueInternalAction', () => {
  it('stores a queued row with its own idempotency key', async () => {
    const id = await enqueueInternalAction({ ticketNo: 'ST-1', action: 'acknowledge' })
    const rows = await queuedActions()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(id)
    expect(rows[0]?.status).toBe('queued')
    expect(rows[0]?.retries).toBe(0)
    expect(rows[0]?.client_uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('gives every row a different client_uuid', async () => {
    await enqueueInternalAction({ ticketNo: 'ST-1', action: 'acknowledge' })
    await enqueueInternalAction({ ticketNo: 'ST-1', action: 'decline', payload: { reason: 'x' } })

    const rows = await queuedActions()

    expect(new Set(rows.map((row) => row.client_uuid)).size).toBe(2)
  })

  it('replays oldest first', async () => {
    const first = await enqueueInternalAction({ ticketNo: 'ST-1', action: 'comment' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await enqueueInternalAction({ ticketNo: 'ST-2', action: 'acknowledge' })

    fetched.mockImplementation(async () => undefined)

    const rows = await queuedActions()

    expect(rows.map((row) => row.id)).toEqual([first, second])
  })
})

describe('updateAction and removeAction', () => {
  it('applies the conflict status and its reason fields', async () => {
    const id = await enqueueInternalAction({ ticketNo: 'ST-1', action: 'acknowledge' })
    await updateAction(id, { status: 'conflict', error_code: 'invalid_transition', ticket_status: 'CANCELLED' })

    const [row] = await queuedActions()

    expect(row?.status).toBe('conflict')
    expect(row?.error_code).toBe('invalid_transition')
    expect(row?.ticket_status).toBe('CANCELLED')
  })

  it('removes a delivered row', async () => {
    const id = await enqueueInternalAction({ ticketNo: 'ST-1', action: 'decline' })
    await removeAction(id)

    expect(await queuedActions()).toHaveLength(0)
  })
})

describe('deliverAction', () => {
  it('removes the row after a successful delivery and sends the client_uuid', async () => {
    const id = await enqueueInternalAction({
      ticketNo: 'ST-7',
      action: 'acknowledge',
      payload: { result: 'fixed' },
    })
    const [row] = await queuedActions()
    fetched.mockImplementation(async () => undefined)

    expect(await deliverAction(row!)).toBe(true)
    expect(await queuedActions()).toHaveLength(0)
    expect(fetched).toHaveBeenCalledWith('/v1/tickets/ST-7/acknowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientUuid: row!.client_uuid, result: 'fixed' }),
    })
    expect(id).toBeGreaterThan(0)
  })

  it('marks a rejected row failed and counts one retry', async () => {
    const id = await enqueueInternalAction({ ticketNo: 'ST-7', action: 'decline' })
    const [row] = await queuedActions()
    fetched.mockRejectedValue(new Error('offline'))

    expect(await deliverAction(row!)).toBe(false)

    const [after] = await queuedActions()

    expect(after?.status).toBe('failed')
    expect(after?.retries).toBe(1)
    expect(id).toBeGreaterThan(0)
  })
})

describe('replayInternalActions', () => {
  it('delivers queued and failed rows but never conflict rows', async () => {
    await enqueueInternalAction({ ticketNo: 'ST-1', action: 'acknowledge' })
    const conflicted = await enqueueInternalAction({ ticketNo: 'ST-2', action: 'decline' })
    await updateAction(conflicted, { status: 'conflict', error_code: 'invalid_transition' })
    fetched.mockImplementation(async () => undefined)

    const result = await replayInternalActions()
    const rows = await queuedActions()

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ticket_no).toBe('ST-2')
  })
})

describe('pendingWrites', () => {
  it('counts reports and actions separately', async () => {
    await enqueueInternalAction({ ticketNo: 'ST-1', action: 'comment' })
    await outboxDb.outbox.add({
      client_uuid: 'fixed-for-test',
      payload: {} as never,
      status: 'queued',
      retries: 0,
      created_at: Date.now(),
    })

    expect(await pendingWrites()).toEqual({ reports: 1, actions: 1 })
  })
})
