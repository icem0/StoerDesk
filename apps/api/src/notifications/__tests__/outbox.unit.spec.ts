import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import { enqueueOutbox, messageOf, type OutboxRow } from '../outbox'
import { beforeEach, describe, expect, it } from 'vitest'

type Db = Database['database']

/** The insert capability the create path uses — `DbLike` in `outbox.ts`. */
type DbLike = Pick<Db, 'insert' | 'select'>

const ticket = {
  id: 'ticket-id-1',
  ticketNo: 'ST-2026-0001',
  priority: 'critical',
  objectName: 'Rathaus',
  objectLocation: 'Hauptstraße 1 12345 Berlin',
  systemType: 'BMA',
  shortText: 'Melder im Treppenhaus piept',
  workOrderNo: 'AA-4711',
}

/** The mandatory minimum channels the fake settings row returns. */
let minimumChannels: string[] = []

/** The joined preference/account rows the fake recipient query returns. */
let recipients: Array<{ userId: string; externalId: string | null }> = []

function setMinimumChannels(channels: string[]): void {
  minimumChannels = channels
}

function setRecipients(rows: Array<{ userId: string; externalId: string | null }>): void {
  recipients = rows
}

beforeEach(() => {
  minimumChannels = []
  recipients = []
})

/**
 * The fake select chain is awaitable and also has `.limit()`: the settings read
 * of `readMinimumChannels` ends in `.limit(1)`, the recipient read of
 * `ntfyRecipients` is awaited after `.where()`.
 */
function awaitable<T>(value: T): Promise<T> & { limit: (count?: number) => Promise<T> } {
  const promise = Promise.resolve(value)

  return Object.assign(promise, { limit: () => promise })
}

/**
 * Records what the create path hands to the insert chain of `enqueueOutbox`.
 *
 * No PostgreSQL is involved: the create path only inserts, and the unit test
 * asserts the channel resolution and the row shape, never a delivered
 * notification. `state = 'PENDING'` and `attempts = 0` come from the column
 * defaults of migration 0019 and are verified on the create-path integration
 * test, which needs the database.
 */
async function enqueueInto(env: Env): Promise<{ count: number; rows: OutboxRow[] }> {
  const rows: OutboxRow[] = []

  const fakeDatabase = {
    insert: (_table: unknown) => ({
      values: (values: OutboxRow[]) => {
        rows.push(...values)
      },
    }),
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          awaitable('value' in columns ? [{ value: minimumChannels }] : []),
        leftJoin: () => ({
          where: () => awaitable('userId' in columns ? recipients : []),
        }),
      }),
    }),
  } as unknown as DbLike

  const count = await enqueueOutbox(fakeDatabase, ticket, env)

  return { count, rows }
}

describe('enqueueOutbox (notification outbox rows in the create transaction)', () => {
  it('writes exactly one row for a configured ntfy channel', async () => {
    const { count, rows } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    expect(count).toBe(1)
    expect(rows).toHaveLength(1)

    const [row] = rows
    expect(row?.channel).toBe('ntfy')
    expect(row?.ticketId).toBe('ticket-id-1')
    expect(row?.target).toEqual({
      ticketNo: 'ST-2026-0001',
      priority: 'critical',
      objectName: 'Rathaus',
      objectLocation: 'Hauptstraße 1 12345 Berlin',
      systemType: 'BMA',
      shortText: 'Melder im Treppenhaus piept',
      workOrderNo: 'AA-4711',
    })
    expect(Object.keys(row?.target ?? {})).not.toContain('phone')
    expect(Object.keys(row?.target ?? {})).not.toContain('email')
  })

  it('writes one ntfy row per user who selected ntfy for ticket.created', async () => {
    setRecipients([
      { userId: 'user-1', externalId: null },
      { userId: 'user-2', externalId: 'custom-topic' },
    ])

    const { count, rows } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    expect(count).toBe(2)
    expect(rows.map((row) => row.channel)).toEqual(['ntfy', 'ntfy'])
    expect(rows.map((row) => row.target.ntfyTopic)).toEqual([
      'stoerdesk-user-1',
      'custom-topic',
    ])
    expect(rows.every((row) => row.target.ticketNo === 'ST-2026-0001')).toBe(true)
    expect(rows.some((row) => row.target.ntfyTopic === 'stoerdesk')).toBe(false)
  })

  it('does not duplicate a per-user ntfy row with the minimum channels of a critical ticket', async () => {
    setMinimumChannels(['ntfy'])
    setRecipients([{ userId: 'user-1', externalId: null }])

    const { count, rows } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    expect(count).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.target.ntfyTopic).toBe('stoerdesk-user-1')
  })

  it('writes no row for an unconfigured environment', async () => {
    const { count, rows } = await enqueueInto(loadEnv({}))

    expect(count).toBe(0)
    expect(rows).toHaveLength(0)
  })

  it('adds the mandatory minimum channels to a critical ticket without duplicating', async () => {
    setMinimumChannels([])
    const configured = loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' })

    setMinimumChannels(['ntfy'])
    const first = await enqueueInto(configured)

    expect(first.count).toBe(1)
    expect(first.rows.map((row) => row.channel)).toEqual(['ntfy'])

    setMinimumChannels(['matrix'])
    const second = await enqueueInto(configured)

    expect(second.count).toBe(2)
    expect(second.rows.map((row) => row.channel)).toEqual(['ntfy', 'matrix'])

    setMinimumChannels([])
  })
})

describe('messageOf (the content of a notification message, §11.5)', () => {
  it('carries the ticket content without contact data or a photo', () => {
    const message = messageOf({
      ticketNo: 'ST-2026-0001',
      priority: 'critical',
      objectName: 'Rathaus',
      objectLocation: 'Hauptstraße 1 12345 Berlin',
      systemType: 'BMA',
      shortText: 'Melder im Treppenhaus piept',
      workOrderNo: 'AA-4711',
    })

    expect(message.title).toBe('ST-2026-0001')
    expect(message.priority).toBe('critical')
    expect(message.body).toContain('critical')
    expect(message.body).toContain('Rathaus')
    expect(message.body).toContain('Hauptstraße 1 12345 Berlin')
    expect(message.body).toContain('BMA')
    expect(message.body).toContain('Melder im Treppenhaus piept')
    expect(message.body).toContain('AA-4711')
    expect(message.body).not.toMatch(/@|\+49/)
  })

  it('tolerates a stored row written before the newer params (backwards compatibility)', () => {
    const message = messageOf({
      ticketNo: 'ST-2026-0001',
      priority: 'normal',
      objectName: 'Rathaus',
    })

    expect(message.title).toBe('ST-2026-0001')
    expect(message.priority).toBe('normal')
    expect(message.body).toBe('normal · Rathaus')
  })
})
