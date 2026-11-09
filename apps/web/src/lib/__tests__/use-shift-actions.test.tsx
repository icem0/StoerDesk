import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/outbox', () => ({
  enqueueShiftAction: vi.fn(),
  queuedShiftActions: vi.fn(),
  removeShiftAction: vi.fn(),
  deliverShiftAction: vi.fn(),
}))

vi.mock('../../lib/api', () => {
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

import { useShiftActions } from '../../features/oncall/use-shift-actions'
import {
  deliverShiftAction,
  enqueueShiftAction,
  queuedShiftActions,
  removeShiftAction,
  type QueuedShiftAction,
} from '../../lib/outbox'
import { apiFetch } from '../../lib/api'

const enqueued = vi.mocked(enqueueShiftAction)
const queued = vi.mocked(queuedShiftActions)
const removed = vi.mocked(removeShiftAction)
const delivered = vi.mocked(deliverShiftAction)
const fetched = vi.mocked(apiFetch)

const shiftId = '22222222-2222-4222-8222-222222222222'

const queuedRow: QueuedShiftAction = {
  client_uuid: 'uuid-1',
  shift_id: shiftId,
  action: 'confirm',
  payload: {},
  status: 'queued',
  retries: 0,
  created_at: Date.now(),
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const originalOnLine = navigator.onLine

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  vi.resetAllMocks()
  queued.mockResolvedValue([])
  enqueued.mockResolvedValue('new-uuid')
  fetched.mockResolvedValue(undefined)
  setOnLine(true)
})

afterEach(() => {
  setOnLine(originalOnLine)
})

describe('useShiftActions', () => {
  it('refreshes the queued rows of this shift on mount', async () => {
    queued.mockResolvedValue([
      queuedRow,
      { ...queuedRow, client_uuid: 'other', shift_id: 'other-shift' },
    ])

    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    expect(result.current.rows[0]?.client_uuid).toBe('uuid-1')
    expect(result.current.rows[0]?.ageMinutes).toBeGreaterThanOrEqual(0)
  })

  it('calls the online confirm route with a clientUuid', async () => {
    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await act(async () => {
      await result.current.confirm()
    })

    expect(enqueued).not.toHaveBeenCalled()
    expect(fetched).toHaveBeenCalledWith(`/v1/oncall/shifts/${shiftId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: expect.stringContaining('"clientUuid"'),
    })
  })

  it('queues the action instead of calling the API while offline', async () => {
    setOnLine(false)
    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await act(async () => {
      await result.current.confirm()
    })

    expect(fetched).not.toHaveBeenCalled()
    expect(enqueued).toHaveBeenCalledWith({
      shiftId,
      action: 'confirm',
      payload: {},
    })
  })

  it('validates the decline reason before queueing or sending', async () => {
    setOnLine(false)
    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await act(async () => {
      await expect(result.current.decline('kurz')).rejects.toMatchObject({
        code: 'oncall_decline_reason_required',
      })
    })

    expect(enqueued).not.toHaveBeenCalled()
    expect(fetched).not.toHaveBeenCalled()
  })

  it('sends a trimmed decline reason', async () => {
    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await act(async () => {
      await result.current.decline('  Krank gemeldet  ')
    })

    expect(fetched).toHaveBeenCalledWith(`/v1/oncall/shifts/${shiftId}/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: expect.stringContaining('"reason":"Krank gemeldet"'),
    })
  })

  it('retries one row and discards it', async () => {
    delivered.mockResolvedValue(true)
    const { result } = renderHook(() => useShiftActions(shiftId), { wrapper })

    await act(async () => {
      await result.current.retry(queuedRow)
      await result.current.discard(queuedRow)
    })

    expect(delivered).toHaveBeenCalledWith(queuedRow)
    expect(removed).toHaveBeenCalledWith('uuid-1')
  })
})
