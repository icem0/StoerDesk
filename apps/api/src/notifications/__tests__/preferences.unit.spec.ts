import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationPreferences } from '../../db/schema'
import { notificationChannelRoutes } from '../routes'
import { readPreferences, writePreferences } from '../preferences'

type Db = Database['database']

/** One row of `notification_preferences` as the store keeps it. */
interface StoredRow {
  id: string
  user_id: string
  event_type: string
  channel: string
}

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
 * column names and parameter values. Enough for the predicates of the
 * preference service; no SQL is executed.
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
 * No PostgreSQL is involved: the service selects, deletes and inserts rows of
 * `notification_preferences` inside one transaction. The fake implements exactly
 * those Drizzle chains, so the replacement and the isolation of the rows of
 * another user are proven in memory.
 */
function fakeDatabase(store: StoredRow[]): Db {
  return {
    select: () => ({
      from: (table: unknown) => {
        expect(table).toBe(notificationPreferences)

        return {
          where: (clause: unknown) => {
            const filtered = store.filter((row) => matches(row, clause))

            return {
              orderBy: async () =>
                [...filtered]
                  .sort(
                    (left, right) =>
                      left.event_type.localeCompare(right.event_type) ||
                      left.channel.localeCompare(right.channel),
                  )
                  .map((row) => ({
                    eventType: row.event_type,
                    channel: row.channel,
                  })),
            }
          },
        }
      },
    }),
    delete: (table: unknown) => {
      expect(table).toBe(notificationPreferences)

      return {
        where: async (clause: unknown) => {
          for (const row of store.filter((candidate) => matches(candidate, clause))) {
            store.splice(store.indexOf(row), 1)
          }
        },
      }
    },
    insert: (table: unknown) => {
      expect(table).toBe(notificationPreferences)

      return {
        values: async (values: unknown) => {
          const rows = Array.isArray(values) ? values : [values]

          for (const entry of rows) {
            const row = entry as Record<string, unknown>
            store.push({
              id: `id-${store.length + 1}`,
              user_id: String(row.userId),
              event_type: String(row.eventType),
              channel: String(row.channel),
            })
          }
        },
      }
    },
    transaction: async (run: (tx: unknown) => unknown) => run(fakeDatabase(store)),
  } as unknown as Db
}

const apps: FastifyInstance[] = []

async function buildApp(store: StoredRow[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  app.addHook('onRequest', async (request) => {
    const user = request.headers['x-test-user']

    if (typeof user === 'string' && user !== '') {
      request.user = {
        id: user,
        email: `${user}@example.org`,
        givenName: '',
        familyName: '',
        locale: 'de',
        theme: 'auto',
        roles: [],
      }
    }
  })

  await app.register(notificationChannelRoutes, {
    database: fakeDatabase(store),
    env: loadEnv({}),
  })

  apps.push(app)

  return app
}

describe('the selection of the channels per event type (WP-M14-16)', () => {
  it('writes and reads back the selection of a user', async () => {
    const store: StoredRow[] = []

    await writePreferences(fakeDatabase(store), 'user-a', [
      { eventType: 'ticket.created', channel: 'telegram' },
      { eventType: 'ticket.resolved', channel: 'ntfy' },
    ])

    expect(store).toHaveLength(2)

    const selection = await readPreferences(fakeDatabase(store), 'user-a')

    expect(selection).toEqual([
      { eventType: 'ticket.created', channel: 'telegram' },
      { eventType: 'ticket.resolved', channel: 'ntfy' },
    ])
  })

  it('replaces the rows of the user and never touches another user', async () => {
    const store: StoredRow[] = [
      { id: 'id-1', user_id: 'user-a', event_type: 'ticket.created', channel: 'telegram' },
      { id: 'id-2', user_id: 'user-a', event_type: 'ticket.resolved', channel: 'ntfy' },
      { id: 'id-3', user_id: 'user-b', event_type: 'ticket.assigned', channel: 'matrix' },
    ]

    await writePreferences(fakeDatabase(store), 'user-a', [
      { eventType: 'oncall.assigned', channel: 'signal' },
    ])

    expect(store.filter((row) => row.user_id === 'user-a')).toEqual([
      { id: 'id-2', user_id: 'user-a', event_type: 'oncall.assigned', channel: 'signal' },
    ])
    expect(store.filter((row) => row.user_id === 'user-b')).toEqual([
      { id: 'id-3', user_id: 'user-b', event_type: 'ticket.assigned', channel: 'matrix' },
    ])
    expect(await readPreferences(fakeDatabase(store), 'user-b')).toEqual([
      { eventType: 'ticket.assigned', channel: 'matrix' },
    ])
  })

  it('answers an empty selection for a user without rows and writes nothing for an empty one', async () => {
    const store: StoredRow[] = []

    expect(await readPreferences(fakeDatabase(store), 'user-a')).toEqual([])

    await writePreferences(fakeDatabase(store), 'user-a', [])

    expect(store).toHaveLength(0)
  })

  it('writes a repeated pair only once', async () => {
    const store: StoredRow[] = []

    await writePreferences(fakeDatabase(store), 'user-a', [
      { eventType: 'ticket.created', channel: 'telegram' },
      { eventType: 'ticket.created', channel: 'telegram' },
    ])

    expect(store).toHaveLength(1)
  })
})

describe('the preference routes of the session (WP-M14-16)', () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('answers 401 without a session', async () => {
    const app = await buildApp([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/preferences',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ code: string }>().code).toBe('session_invalid')
  })

  it('reads and replaces the selection of the session user', async () => {
    const store: StoredRow[] = []
    const app = await buildApp(store)

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: { 'x-test-user': 'user-a' },
      payload: {
        preferences: [
          { eventType: 'ticket.created', channel: 'telegram' },
          { eventType: 'ticket.resolved', channel: 'ntfy' },
        ],
      },
    })

    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toEqual({
      preferences: [
        { eventType: 'ticket.created', channel: 'telegram' },
        { eventType: 'ticket.resolved', channel: 'ntfy' },
      ],
    })

    const replaced = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: { 'x-test-user': 'user-a' },
      payload: {
        preferences: [{ eventType: 'ticket.assigned', channel: 'signal' }],
      },
    })

    expect(replaced.statusCode).toBe(200)
    expect(replaced.json()).toEqual({
      preferences: [{ eventType: 'ticket.assigned', channel: 'signal' }],
    })
    expect(store).toHaveLength(1)

    const own = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/preferences',
      headers: { 'x-test-user': 'user-a' },
    })

    expect(own.statusCode).toBe(200)
    expect(own.json()).toEqual({ preferences: [{ eventType: 'ticket.assigned', channel: 'signal' }] })
  })

  it('refuses an unknown event type and an unknown channel with 422 and writes nothing', async () => {
    const store: StoredRow[] = []
    const app = await buildApp(store)

    const badEventType = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: { 'x-test-user': 'user-a' },
      payload: {
        preferences: [{ eventType: 'ticket.declared', channel: 'telegram' }],
      },
    })

    expect(badEventType.statusCode).toBe(422)
    expect(badEventType.json<{ code: string }>().code).toBe('invalid_request')
    expect(store).toHaveLength(0)

    const badChannel = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: { 'x-test-user': 'user-a' },
      payload: {
        preferences: [{ eventType: 'ticket.created', channel: 'pigeon' }],
      },
    })

    expect(badChannel.statusCode).toBe(422)
    expect(badChannel.json<{ code: string }>().code).toBe('invalid_request')
    expect(store).toHaveLength(0)
  })
})
