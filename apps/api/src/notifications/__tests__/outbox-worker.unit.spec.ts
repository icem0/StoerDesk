import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import { drainOutbox, type ClaimedOutboxRow } from '../outbox'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Db = Database['database']

type MutableRow = {
  id: string
  ticketId: string
  channel: string
  target: Record<string, unknown>
  state: string
  attempts: number
}

const ticketNo = 'ST-2026-0001'

const row = (channel: string): MutableRow => ({
  id: 'row-id-1',
  ticketId: 'ticket-id-1',
  channel,
  target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
  state: 'PENDING',
  attempts: 0,
})

const envNtfy = (): Env =>
  loadEnv({ NTFY_URL: 'https://ntfy.mock/stoerdesk', NTFY_TOPIC: 'stoerdesk' })

/** A draineable in-memory `outbox`: exactly the Drizzle chain the worker uses, nothing more. */
function inMemoryDatabase(rows: MutableRow[]) {
  const events: Array<{
    ticketId: string
    type: string
    actorKind: string
    payload: Record<string, unknown>
  }> = []
  let claimed: MutableRow | undefined

  const fakeDatabase = {
    update: (_table: unknown) => ({
      set: (setArg: unknown) => {
        const set = setArg as { state?: string }

        if (typeof set.state === 'string' && claimed !== undefined) {
          claimed.state = set.state
        }

        return {
          where: (_where: unknown) => ({
            returning: async (_columns: unknown): Promise<ClaimedOutboxRow[]> => {
              const next = rows.find((row) => row.state === 'PENDING')

              if (next === undefined) {
                claimed = undefined
                return []
              }

              next.attempts += 1
              claimed = next

              return [
                {
                  id: next.id,
                  ticketId: next.ticketId,
                  channel: next.channel,
                  target: next.target,
                  attempts: next.attempts,
                },
              ]
            },
          }),
        }
      },
    }),
    insert: (_table: unknown) => ({
      values: async (value: unknown) => {
        events.push(
          value as {
            ticketId: string
            type: string
            actorKind: string
            payload: Record<string, unknown>
          },
        )
      },
    }),
    transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDatabase),
  } as unknown as Db

  return { fakeDatabase, events, rows }
}

describe('drainOutbox (notification outbox drain worker, unit)', () => {
  afterEach(() => {
    const originalFetch = global.fetch

    if (typeof originalFetch !== 'undefined') {
      ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch
    }
  })

  it('drains nothing and writes nothing when no row is pending', async () => {
    const { fakeDatabase, events } = inMemoryDatabase([])

    const result = await drainOutbox(fakeDatabase, envNtfy())

    expect(result).toEqual({ sent: 0, failed: 0, attempts: 0 })
    expect(events).toEqual([])
  })

  it('ends SENT with three attempts when the channel fails twice then succeeds', async () => {
    const statuses = [500, 500, 200]
    let calls = 0
    const rows = [row('ntfy')]
    const { fakeDatabase, events } = inMemoryDatabase(rows)

    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(async () => {
      calls += 1

      return new Response('{}', { status: statuses[calls - 1] ?? 200 })
    }) as unknown as typeof fetch

    const result = await drainOutbox(fakeDatabase, envNtfy())

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(result).toEqual({ sent: 1, failed: 0, attempts: 3 })
    expect(calls).toBe(3)
    expect(rows[0]?.state).toBe('SENT')
    expect(rows[0]?.attempts).toBe(3)

    const sentEvent = events.find((event) => event.type === 'notification_sent')

    expect(sentEvent).toBeDefined()
    expect(sentEvent?.actorKind).toBe('system')
    expect(sentEvent?.payload).toEqual({ channel: 'ntfy', ticketNo, attempts: 3 })
    expect(events.filter((event) => event.type === 'notification_failed')).toEqual([])
  })

  it('ends FAILED when the channel always fails', async () => {
    const rows = [row('ntfy')]
    const { fakeDatabase, events } = inMemoryDatabase(rows)

    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(async () => {
      return new Response('nope', { status: 500 })
    }) as unknown as typeof fetch

    const result = await drainOutbox(fakeDatabase, envNtfy())

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(result).toEqual({ sent: 0, failed: 1, attempts: 3 })
    expect(rows[0]?.state).toBe('FAILED')
    expect(rows[0]?.attempts).toBe(3)

    const failedEvent = events.find((event) => event.type === 'notification_failed')

    expect(failedEvent).toBeDefined()
    expect(failedEvent?.actorKind).toBe('system')
    expect(failedEvent?.payload).toEqual({ channel: 'ntfy', ticketNo, attempts: 3 })
    expect(events.filter((event) => event.type === 'notification_sent')).toEqual([])
  })

  it('ends FAILED without a send when the channel is no longer configured', async () => {
    const rows = [row('telegram')]
    const { fakeDatabase, events } = inMemoryDatabase(rows)

    const fetchMock = vi.fn()
    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = fetchMock as unknown as typeof fetch

    const result = await drainOutbox(fakeDatabase, envNtfy())

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(result).toEqual({ sent: 0, failed: 1, attempts: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows[0]?.state).toBe('FAILED')
    expect(rows[0]?.attempts).toBe(1)

    const failedEvent = events.find((event) => event.type === 'notification_failed')

    expect(failedEvent).toBeDefined()
    expect(failedEvent?.payload).toEqual({ channel: 'telegram', ticketNo, attempts: 1 })
  })

  it('keeps the oldest-first order across multiple pending rows', async () => {
    const first = row('ntfy')
    const second = row('ntfy')
    second.id = 'row-id-2'
    second.ticketId = 'ticket-id-2'
    const statuses = [200, 200]
    let calls = 0
    const rows = [first, second]
    const { fakeDatabase, events } = inMemoryDatabase(rows)

    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(async () => {
      calls += 1

      return new Response('{}', { status: statuses[calls - 1] ?? 200 })
    }) as unknown as typeof fetch

    const result = await drainOutbox(fakeDatabase, envNtfy())

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(result).toEqual({ sent: 2, failed: 0, attempts: 2 })
    expect(rows[0]?.state).toBe('SENT')
    expect(rows[1]?.state).toBe('SENT')
    expect(events).toHaveLength(2)
    expect(events[0]?.ticketId).toBe('ticket-id-1')
    expect(events[1]?.ticketId).toBe('ticket-id-2')
  })

  it('keeps the existing `created` event of the ticket untouched', async () => {
    const { fakeDatabase, events } = inMemoryDatabase([row('ntfy')])
    const created = { ticketId: 'ticket-id-1', type: 'created', actorKind: 'public', payload: {} }

    events.push(created)

    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(
      async () => new Response('{}', { status: 500 }),
    ) as unknown as typeof fetch

    await drainOutbox(fakeDatabase, envNtfy())

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(events).toContainEqual(created)
    expect(events.filter((event) => event.type === 'notification_failed')).toHaveLength(1)
  })
})
