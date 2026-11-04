import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../lib/outbox', () => ({
  enqueueInternalAction: vi.fn(),
  queuedActions: vi.fn(),
  deliverAction: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    readonly status: number
    readonly code?: string
    constructor(options: { status: number; code?: string }) {
      super('API request failed')
      this.name = 'ApiError'
      this.status = options.status
      this.code = options.code
    }
  },
}))

import { useInternalActions } from '../../features/tickets/use-internal-actions'
import {
  enqueueInternalAction,
  queuedActions,
  deliverAction,
} from '../../lib/outbox'

const enqueued = vi.mocked(enqueueInternalAction)
const queued = vi.mocked(queuedActions)
const delivered = vi.mocked(deliverAction)

beforeEach(() => {
  vi.resetAllMocks()
  queued.mockResolvedValue([])
  enqueued.mockResolvedValue(1)
  delivered.mockResolvedValue(true)
})

describe('useInternalActions', () => {
  it('enqueues exactly one row with a stable client_uuid and bumps the pending count', async () => {
    const { result } = renderHook(() => useInternalActions('ST-1'))

    await act(async () => {
      await result.current.queueAction('acknowledge', { result: 'fixed' })
    })

    expect(enqueued).toHaveBeenCalledTimes(1)
    expect(enqueued).toHaveBeenCalledWith({
      ticketNo: 'ST-1',
      action: 'acknowledge',
      payload: { result: 'fixed' },
    })
    expect(result.current.pendingCount).toBe(1)
  })

  it('gives every enqueued row a different client_uuid (via the outbox)', async () => {
    enqueued.mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    const { result } = renderHook(() => useInternalActions('ST-1'))

    await act(async () => {
      await result.current.queueAction('acknowledge', {})
      await result.current.queueAction('decline', { reason: 'x' })
    })

    expect(enqueued).toHaveBeenCalledTimes(2)
    const payloads = enqueued.mock.calls.map((call) => call[0].payload)
    expect(payloads).toEqual([{}, { reason: 'x' }])
  })

  it('refreshes pendingCount from queuedActions on mount', async () => {
    queued.mockResolvedValue([
      {
        ticket_no: 'ST-1',
        client_uuid: 'uuid-1',
        action: 'acknowledge',
        payload: {},
        status: 'queued',
        retries: 0,
        created_at: Date.now(),
      },
      {
        ticket_no: 'ST-1',
        client_uuid: 'uuid-2',
        action: 'decline',
        payload: {},
        status: 'failed',
        retries: 1,
        created_at: Date.now(),
      },
      {
        ticket_no: 'ST-2',
        client_uuid: 'uuid-3',
        action: 'acknowledge',
        payload: {},
        status: 'queued',
        retries: 0,
        created_at: Date.now(),
      },
    ])

    const { result } = renderHook(() => useInternalActions('ST-1'))

    await act(async () => {})

    expect(result.current.pendingCount).toBe(2)
  })

  it('deliverNow calls deliverAction and decrements the pending count on success', async () => {
    const row = {
      id: 1,
      client_uuid: 'fixed-uuid',
      ticket_no: 'ST-1',
      action: 'acknowledge' as const,
      payload: { result: 'fixed' },
      status: 'queued' as const,
      retries: 0,
      created_at: Date.now(),
    }
    delivered.mockResolvedValue(true)

    const { result } = renderHook(() => useInternalActions('ST-1'))

    await act(async () => {
      await result.current.deliverNow(row)
    })

    expect(delivered).toHaveBeenCalledWith(row)
    expect(result.current.pendingCount).toBe(0)
  })

  it('the comment payload travels unchanged', async () => {
    const { result } = renderHook(() => useInternalActions('ST-1'))

    await act(async () => {
      await result.current.queueAction('comment', { text: 'Leckage am Ventil' })
    })

    expect(enqueued).toHaveBeenCalledWith({
      ticketNo: 'ST-1',
      action: 'comment',
      payload: { text: 'Leckage am Ventil' },
    })
  })

  it('does not enqueue on its own; queueAction is the only write path', async () => {
    renderHook(() => useInternalActions('ST-1'))

    expect(enqueued).not.toHaveBeenCalled()
  })
})
