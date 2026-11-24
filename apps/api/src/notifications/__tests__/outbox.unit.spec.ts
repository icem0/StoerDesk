import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import { notificationMessages } from '../../db/schema'
import { enqueueOutbox, messageOf, type OutboxRow } from '../outbox'
import { describe, expect, it } from 'vitest'

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

/**
 * Records what the create path hands to the insert chain of `enqueueOutbox`.
 *
 * No PostgreSQL is involved: the create path only inserts, and the unit test
 * asserts the channel resolution and the row shape, never a delivered
 * notification. `state = 'PENDING'` and `attempts = 0` come from the column
 * defaults of migration 0019 and are verified on the create-path integration
 * test, which needs the database.
 */
async function enqueueInto(env: Env): Promise<{
  count: number
  rows: OutboxRow[]
  messages: Array<{ userId: string; channel: string; title: string; body: string }>
}> {
  const rows: OutboxRow[] = []
  const messages: Array<{ userId: string; channel: string; title: string; body: string }> = []

  const fakeDatabase = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        // The personal message of a delivery (WP-M14-120b) is written before
        // its outbox row and hands the id of the message to the row.
        if (table === notificationMessages) {
          const inserted = (Array.isArray(values) ? values : [values]).map((entry) => {
            const message = entry as { userId: string; channel: string; title: string; body: string }

            messages.push(message)

            return message
          })

          return {
            returning: async () =>
              inserted.map((_message, index) => ({ id: `message-${index}` })),
          }
        }

        rows.push(...(values as OutboxRow[]))

        return undefined
      },
    }),
  } as unknown as DbLike

  const count = await enqueueOutbox(fakeDatabase, ticket, env)

  return { count, rows, messages }
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

  it('writes no row for an unconfigured environment', async () => {
    const { count, rows } = await enqueueInto(loadEnv({}))

    expect(count).toBe(0)
    expect(rows).toHaveLength(0)
  })

  it('writes one row per configured channel of the installation and no personal row', async () => {
    const { count, rows, messages } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    // The new ticket goes to the channels of the installation (ADR-0045); the
    // messages that name a user go over the channels of that user.
    expect(count).toBe(1)
    expect(rows.map((row) => row.channel)).toEqual(['ntfy'])
    expect(messages).toHaveLength(0)
  })

  it('writes no personal row for a critical ticket — the rule of the administration does not decide the way', async () => {
    const { count, rows } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    expect(count).toBe(1)
    expect(rows.map((row) => row.channel)).toEqual(['ntfy'])
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

  it('sends the first reminder of a shift without an urgency (WP-M23-09d)', () => {
    const message = messageOf({
      shiftId: '22222222-2222-4222-8222-222222222222',
      poolName: 'Bereitschaft',
      state: 'PLANNED',
      startsAt: '2026-11-30T08:00:00.000Z',
      endsAt: '2026-11-30T16:00:00.000Z',
      reminderNumber: 1,
    })

    expect(message.urgency).toBeUndefined()
    expect(message.ntfyPriority).toBeUndefined()
  })

  it('raises the urgency of every further reminder of a shift (WP-M23-09d)', () => {
    const second = messageOf({
      shiftId: '22222222-2222-4222-8222-222222222222',
      poolName: 'Bereitschaft',
      state: 'PLANNED',
      startsAt: '2026-11-30T08:00:00.000Z',
      endsAt: '2026-11-30T16:00:00.000Z',
      reminderNumber: 2,
    })

    expect(second.urgency).toBe('high')
    expect(second.ntfyPriority).toBe(4)

    const third = messageOf({
      shiftId: '22222222-2222-4222-8222-222222222222',
      poolName: 'Bereitschaft',
      state: 'PLANNED',
      startsAt: '2026-11-30T08:00:00.000Z',
      endsAt: '2026-11-30T16:00:00.000Z',
      reminderNumber: 3,
    })

    expect(third.urgency).toBe('high')
    expect(third.ntfyPriority).toBe(5)
  })
})
