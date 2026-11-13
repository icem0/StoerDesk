import { describe, expect, it } from 'vitest'

import type { Database } from '../../db/client'
import { notificationAccounts } from '../../db/schema'
import { deleteAccount, listAccounts, storeAccount } from '../accounts'

type Db = Database['database']

/** One row of `notification_accounts` as the service stores and reads it. */
interface StoredRow {
  id: string
  user_id: string
  channel: string
  externalId: string
  label: string
  secret: string
}

/** The column/value pair of one `eq(...)` chunk of a Drizzle `where` clause. */
interface Condition {
  column: string
  value: unknown
}

interface SqlChunk {
  constructor: { name: string }
  value?: unknown
  name?: string
  queryChunks?: SqlChunk[]
}

/**
 * Walks the query chunks of an `eq`/`and` clause and collects the compared
 * column names and parameter values. Enough for the simple predicates of the
 * account service; no SQL is executed.
 */
function conditions(sql: unknown): Condition[] {
  const chunks = (sql as { queryChunks?: SqlChunk[] }).queryChunks ?? []
  const collected: Condition[] = []

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]

    if (chunk === undefined) {
      continue
    }

    if (chunk.constructor.name === 'SQL') {
      collected.push(...conditions(chunk))
      continue
    }

    const separator = chunks[index + 1]?.value
    const param = chunks[index + 2]

    if (
      typeof chunk.name === 'string' &&
      Array.isArray(separator) &&
      separator.join('') === ' = ' &&
      param?.constructor.name === 'Param'
    ) {
      collected.push({ column: chunk.name, value: param.value })
    }
  }

  return collected
}

function matches(row: StoredRow, sql: unknown): boolean {
  return conditions(sql).every(
    (condition) =>
      (row as unknown as Record<string, unknown>)[condition.column] ===
      condition.value,
  )
}

/**
 * No PostgreSQL is involved: the service selects, upserts and deletes rows of
 * `notification_accounts`. The fake implements exactly those Drizzle chains and
 * keeps the secret of a row in memory, so the test can prove that the answer of
 * the service never carries it.
 */
function fakeDatabase(store: StoredRow[]): Db {
  return {
    select: () => ({
      from: (table: unknown) => {
        expect(table).toBe(notificationAccounts)

        return {
          where: (clause: unknown) => {
            const filtered = store.filter((row) => matches(row, clause))

            return {
              orderBy: async () =>
                [...filtered].sort((left, right) =>
                  left.channel.localeCompare(right.channel),
                ),
              limit: async (count: number) => filtered.slice(0, count),
            }
          },
        }
      },
    }),
    insert: (table: unknown) => {
      expect(table).toBe(notificationAccounts)

      return {
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
            const userId = String(values.userId)
            const channel = String(values.channel)
            const existing = store.find(
              (row) => row.user_id === userId && row.channel === channel,
            )

            if (existing !== undefined) {
              const target = existing as unknown as Record<string, unknown>

              for (const [key, value] of Object.entries(values)) {
                if (key !== 'userId' && key !== 'channel') {
                  target[key] = value
                }
              }

              Object.assign(existing, set)
              return
            }

            store.push({
              id: `id-${store.length + 1}`,
              user_id: userId,
              channel,
              externalId: String(values.externalId),
              label: String(values.label ?? ''),
              secret: String(values.secret ?? ''),
            })
          },
        }),
      }
    },
    delete: (table: unknown) => {
      expect(table).toBe(notificationAccounts)

      return {
        where: (clause: unknown) => ({
          returning: async () => {
            const removed = store.filter((row) => matches(row, clause))

            for (const row of removed) {
              store.splice(store.indexOf(row), 1)
            }

            return removed.map((row) => ({ id: row.id }))
          },
        }),
      }
    },
  } as unknown as Db
}

describe('the accounts of the users (WP-M14-08)', () => {
  it('answers a stored account without the secret', async () => {
    const database = fakeDatabase([])

    const stored = await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a',
      label: 'Telegram',
      secret: 'token-a',
    })

    expect(stored).toEqual({
      channel: 'telegram',
      externalId: '@user-a',
      label: 'Telegram',
      secretSet: true,
    })
    expect('secret' in stored).toBe(false)
    expect(JSON.stringify(stored)).not.toContain('token-a')
  })

  it('lists only the accounts of the given user', async () => {
    const database = fakeDatabase([])

    await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a',
      secret: 'token-a',
    })
    await storeAccount(database, 'user-a', {
      channel: 'matrix',
      externalId: '@a:matrix.mock',
      secret: 'token-matrix',
    })
    await storeAccount(database, 'user-b', {
      channel: 'telegram',
      externalId: '@user-b',
      secret: 'token-b',
    })

    const accounts = await listAccounts(database, 'user-a')

    expect(accounts).toEqual([
      { channel: 'matrix', externalId: '@a:matrix.mock', label: '', secretSet: true },
      { channel: 'telegram', externalId: '@user-a', label: '', secretSet: true },
    ])
    expect(JSON.stringify(accounts)).not.toContain('token-')
  })

  it('keeps the stored secret on an update without a new secret', async () => {
    const store: StoredRow[] = []
    const database = fakeDatabase(store)

    await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a',
      label: 'Old label',
      secret: 'token-a',
    })

    const updated = await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a-new',
      label: 'New label',
      secret: '',
    })

    expect(store).toHaveLength(1)
    expect(store[0]?.secret).toBe('token-a')
    expect(updated).toEqual({
      channel: 'telegram',
      externalId: '@user-a-new',
      label: 'New label',
      secretSet: true,
    })

    const withoutSecret = await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a-new',
      label: 'New label',
    })

    expect(store[0]?.secret).toBe('token-a')
    expect(withoutSecret.secretSet).toBe(true)
  })

  it('never deletes the account of another user', async () => {
    const store: StoredRow[] = []
    const database = fakeDatabase(store)

    await storeAccount(database, 'user-a', {
      channel: 'telegram',
      externalId: '@user-a',
      secret: 'token-a',
    })

    expect(await deleteAccount(database, 'user-b', 'telegram')).toBe(false)
    expect(store).toHaveLength(1)

    expect(await deleteAccount(database, 'user-a', 'telegram')).toBe(true)
    expect(store).toHaveLength(0)
  })
})
