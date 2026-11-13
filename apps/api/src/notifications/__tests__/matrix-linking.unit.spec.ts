import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationAccounts } from '../../db/schema'
import { storeMatrixAccount, verifyMatrixAccount, MatrixLinkingError } from '../matrix-linking'
import { notificationChannelRoutes } from '../routes'

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
      (row as unknown as Record<string, unknown>)[condition.column] === condition.value,
  )
}

/**
 * No PostgreSQL is involved: the linking upserts and reads one `notification_accounts`
 * row via the service of WP-M14-08 and the removal deletes one row. The fake
 * implements exactly those Drizzle chains and keeps the secret in memory, so the
 * test can prove that no answer of the route carries it.
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

const ACCESS_TOKEN = 'matrix-access-token-42'
const HOMESERVER = 'https://matrix.mock'
const MATRIX_ID = 'alice@example.org'

const apps: FastifyInstance[] = []

async function buildApp(options: {
  store: StoredRow[]
  matrixFetch?: typeof fetch
}): Promise<FastifyInstance> {
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
    database: fakeDatabase(options.store),
    env: loadEnv({}),
    ...(options.matrixFetch === undefined ? {} : { matrixFetch: options.matrixFetch }),
  })

  apps.push(app)

  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

/** A homeserver whose `whoami` answer names the given user. */
function homeserverAnswer(userId: string): typeof fetch {
  const transport = vi.fn(async () =>
    new Response(JSON.stringify({ user_id: userId, uuid: 'session-uuid' }), { status: 200 }),
  )

  return transport as unknown as typeof fetch
}

/** A homeserver that rejects the request with a non-ok status. */
function homeserverError(status: number): typeof fetch {
  const transport = vi.fn(async () => new Response('{}', { status }))

  return transport as unknown as typeof fetch
}

/** A homeserver answer that is no JSON at all. */
function homeserverInvalidAnswer(): typeof fetch {
  const transport = vi.fn(async () => new Response('not json', { status: 200 }))

  return transport as unknown as typeof fetch
}

/** A homeserver the instance cannot reach. */
function homeserverUnreachable(): typeof fetch {
  const transport = vi.fn(async () => {
    throw new TypeError('connection refused')
  })

  return transport as unknown as typeof fetch
}

/** Calls the linking route of an app with the submitted triple. */
async function linkMatrix(
  app: FastifyInstance,
  userId: string,
  config: { homeserver: string; matrixId: string; accessToken: string },
) {
  return await app.inject({
    method: 'POST',
    url: '/api/v1/notifications/accounts/matrix',
    headers: { 'x-test-user': userId },
    payload: config,
  })
}

describe('the Matrix account linking (WP-M14-11)', () => {
  it('verifies the pair and stores the account with the token as secret', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverAnswer(MATRIX_ID) })

    const linked = await linkMatrix(app, 'alice', {
      homeserver: HOMESERVER,
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(linked.statusCode).toBe(200)
    expect(linked.json()).toEqual({
      channel: 'matrix',
      externalId: MATRIX_ID,
      label: '',
      secretSet: true,
    })
    expect(linked.body).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'matrix',
        externalId: MATRIX_ID,
        label: '',
        secret: ACCESS_TOKEN,
      },
    ])
  })

  it('verifies the homeserver answer over the service', async () => {
    const verified = await verifyMatrixAccount(
      { homeserver: `${HOMESERVER}/`, matrixId: MATRIX_ID, accessToken: ACCESS_TOKEN },
      homeserverAnswer(MATRIX_ID),
    )

    expect(verified).toEqual({ matrixId: MATRIX_ID })

    let thrown: unknown

    try {
      await verifyMatrixAccount(
        { homeserver: HOMESERVER, matrixId: MATRIX_ID, accessToken: ACCESS_TOKEN },
        homeserverAnswer('eve@example.org'),
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MatrixLinkingError)
    expect((thrown as MatrixLinkingError).code).toBe('account_mismatch')
    expect((thrown as MatrixLinkingError).message).not.toContain(ACCESS_TOKEN)
  })

  it('stores the verified account over the account service', async () => {
    const store: StoredRow[] = []

    const account = await storeMatrixAccount(
      fakeDatabase(store),
      'alice',
      { homeserver: HOMESERVER, matrixId: MATRIX_ID, accessToken: ACCESS_TOKEN },
      homeserverAnswer(MATRIX_ID),
    )

    expect(account).toEqual({ channel: 'matrix', externalId: MATRIX_ID, label: '', secretSet: true })
    expect(JSON.stringify(account)).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'matrix',
        externalId: MATRIX_ID,
        label: '',
        secret: ACCESS_TOKEN,
      },
    ])
  })

  it('refuses an account the homeserver does not name with 422', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverAnswer('eve@example.org') })

    const refused = await linkMatrix(app, 'alice', {
      homeserver: HOMESERVER,
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invalid_request')
    expect(refused.body).not.toContain(ACCESS_TOKEN)
    expect(refused.body).not.toContain('eve@example.org')
    expect(store).toEqual([])
  })

  it('refuses a homeserver that rejects the token with 422', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverError(403) })

    const refused = await linkMatrix(app, 'alice', {
      homeserver: HOMESERVER,
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invalid_request')
    expect(refused.body).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([])
  })

  it('refuses a homeserver answer that names no user with 422', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverInvalidAnswer() })

    const refused = await linkMatrix(app, 'alice', {
      homeserver: HOMESERVER,
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invalid_request')
    expect(refused.body).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([])
  })

  it('refuses a non-https homeserver before any request', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverAnswer(MATRIX_ID) })

    const refused = await linkMatrix(app, 'alice', {
      homeserver: 'http://matrix.mock',
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invalid_request')
    expect(refused.body).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([])
  })

  it('keeps an unreachable homeserver a server error without the token', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store, matrixFetch: homeserverUnreachable() })

    const failed = await linkMatrix(app, 'alice', {
      homeserver: HOMESERVER,
      matrixId: MATRIX_ID,
      accessToken: ACCESS_TOKEN,
    })

    expect(failed.statusCode).toBe(500)
    expect(failed.body).not.toContain(ACCESS_TOKEN)
    expect(store).toEqual([])
  })

  it('refuses a body that misses a field with 422', async () => {
    const app = await buildApp({ store: [], matrixFetch: homeserverAnswer(MATRIX_ID) })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/matrix',
      headers: { 'x-test-user': 'alice' },
      payload: { homeserver: HOMESERVER, matrixId: MATRIX_ID },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json<{ code: string }>().code).toBe('invalid_request')
  })

  it('removes the own account with 204 and keeps foreign accounts', async () => {
    const store: StoredRow[] = [
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'matrix',
        externalId: MATRIX_ID,
        label: '',
        secret: ACCESS_TOKEN,
      },
      {
        id: 'id-2',
        user_id: 'bob',
        channel: 'matrix',
        externalId: 'bob@example.org',
        label: '',
        secret: 'other-token',
      },
    ]
    const app = await buildApp({ store })

    const foreign = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/matrix',
      headers: { 'x-test-user': 'eve' },
    })

    expect(foreign.statusCode).toBe(404)
    expect(foreign.body).not.toContain(ACCESS_TOKEN)
    expect(store).toHaveLength(2)

    const own = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/matrix',
      headers: { 'x-test-user': 'alice' },
    })

    expect(own.statusCode).toBe(204)
    expect(own.body).toBe('')
    expect(store).toEqual([
      { id: 'id-2', user_id: 'bob', channel: 'matrix', externalId: 'bob@example.org', label: '', secret: 'other-token' },
    ])
  })

  it('answers 404 for an account the user does not have', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ store })

    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/matrix',
      headers: { 'x-test-user': 'alice' },
    })

    expect(missing.statusCode).toBe(404)
    expect(missing.json<{ code: string }>().code).toBe('account_not_found')

    const unknownChannel = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/pigeon',
      headers: { 'x-test-user': 'alice' },
    })

    expect(unknownChannel.statusCode).toBe(404)
    expect(unknownChannel.json<{ code: string }>().code).toBe('account_not_found')
  })

  it('answers 401 without a session', async () => {
    const app = await buildApp({ store: [] })

    const anonymous = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/matrix',
    })

    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.json<{ code: string }>().code).toBe('session_invalid')

    const anonymousLink = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/matrix',
      payload: { homeserver: HOMESERVER, matrixId: MATRIX_ID, accessToken: ACCESS_TOKEN },
    })

    expect(anonymousLink.statusCode).toBe(401)
    expect(anonymousLink.json<{ code: string }>().code).toBe('session_invalid')
  })
})
