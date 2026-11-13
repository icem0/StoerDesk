import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationAccounts, notificationChannels } from '../../db/schema'
import {
  readBridgeStatus,
  storeWhatsAppAccount,
  WhatsAppLinkingError,
} from '../whatsapp-linking'
import { notificationChannelRoutes } from '../routes'

type Db = Database['database']

/** One row of `notification_channels` as the route reads the bridge config. */
interface StoredChannel {
  kind: string
  config: Record<string, string>
  secret: string
}

/** One row of `notification_accounts` as the service of WP-M14-08 stores it. */
interface StoredAccount {
  id: string
  user_id: string
  channel: string
  externalId: string
  label: string
  secret: string
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
 * column names and parameter values. Enough for the simple predicates of the
 * account service and the bridge config read; no SQL is executed.
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

function matches(row: Record<string, unknown>, sql: unknown): boolean {
  return conditions(sql).every(
    (condition) => row[condition.column] === condition.value,
  )
}

/**
 * No PostgreSQL: the bridge config read selects the `notification_channels` row
 * of kind `whatsapp`, the account service upserts and reads one
 * `notification_accounts` row and the removal deletes one row. The fake
 * implements exactly those Drizzle chains and keeps the bearer in the channel
 * row, so the test can prove no answer carries it.
 */
function fakeDatabase(channels: StoredChannel[], accounts: StoredAccount[]): Db {
  return {
    select: () => ({
      from: (table: unknown) => {
        const store = (
          table === notificationChannels
            ? channels.map((row) => row as unknown as Record<string, unknown>)
            : accounts.map((row) => row as unknown as Record<string, unknown>)
        )

        return {
          where: (clause: unknown) => {
            const filtered = store.filter((row) => matches(row, clause))

            return {
              orderBy: async () => filtered,
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
            const existing = accounts.find(
              (row) => row.user_id === userId && row.channel === channel,
            )

            if (existing !== undefined) {
            for (const [key, value] of Object.entries(values)) {
              if (key !== 'userId' && key !== 'channel') {
                ;(existing as unknown as Record<string, unknown>)[key] = value
              }
            }

              Object.assign(existing, set)
              return
            }

            accounts.push({
              id: `id-${accounts.length + 1}`,
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
            const removed = accounts.filter((row) => matches(row as unknown as Record<string, unknown>, clause))

            for (const row of removed) {
              accounts.splice(accounts.indexOf(row), 1)
            }

            return removed.map((row) => ({ id: row.id }))
          },
        }),
      }
    },
  } as unknown as Db
}

const BRIDGE_TOKEN = 'bridge-bearer-42'
const BRIDGE_URL = 'https://bridge.mock'

const apps: FastifyInstance[] = []

async function buildApp(options: {
  channels: StoredChannel[]
  accounts: StoredAccount[]
  whatsappFetch?: typeof fetch
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
    database: fakeDatabase(options.channels, options.accounts),
    env: loadEnv({}),
    ...(options.whatsappFetch === undefined ? {} : { whatsappFetch: options.whatsappFetch }),
  })

  apps.push(app)

  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

/** A bridge that is connected and names its chats. */
function bridgeConnected(): typeof fetch {
  const transport = vi.fn(async () =>
    new Response(
      JSON.stringify({
        connected: true,
        chats: [
          { id: 'chat-1', label: 'Depression Team' },
          { id: 'chat-2', label: 'Office Chat' },
        ],
      }),
      { status: 200 },
    ),
  )

  return transport as unknown as typeof fetch
}

/** A bridge the instance cannot reach. */
function bridgeUnreachable(): typeof fetch {
  const transport = vi.fn(async () => {
    throw new TypeError('connection refused')
  })

  return transport as unknown as typeof fetch
}

/** A bridge that rejects the request with a non-ok status. */
function bridgeError(status: number): typeof fetch {
  const transport = vi.fn(async () => new Response('{}', { status }))

  return transport as unknown as typeof fetch
}

/** A bridge answer that is no JSON at all. */
function bridgeInvalidAnswer(): typeof fetch {
  const transport = vi.fn(async () => new Response('not json', { status: 200 }))

  return transport as unknown as typeof fetch
}

const CHANNEL_ROW: StoredChannel = {
  kind: 'whatsapp',
  config: { baseUrl: BRIDGE_URL },
  secret: BRIDGE_TOKEN,
}

describe('readBridgeStatus over the bridge contract (WP-M14-15, §11.6)', () => {
  it('answers the chats of a connected bridge and keeps the bearer out of the answer', async () => {
    const status = await readBridgeStatus({ baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN }, bridgeConnected())

    expect(status).toEqual({
      connected: true,
      chats: [
        { id: 'chat-1', label: 'Depression Team' },
        { id: 'chat-2', label: 'Office Chat' },
      ],
    })
    expect(JSON.stringify(status)).not.toContain(BRIDGE_TOKEN)
  })

  it('reads the status without a bearer over a missing bridge url', async () => {
    const status = await readBridgeStatus({ baseUrl: '', token: '' }, bridgeConnected())

    expect(status).toEqual({ connected: false, chats: [] })
  })

  it('answers an unreachable bridge as not connected and never an error', async () => {
    const status = await readBridgeStatus(
      { baseUrl: `${BRIDGE_URL}/`, token: BRIDGE_TOKEN },
      bridgeUnreachable(),
    )

    expect(status).toEqual({ connected: false, chats: [] })
  })

  it('answers a non-ok bridge as not connected', async () => {
    const status = await readBridgeStatus({ baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN }, bridgeError(500))

    expect(status).toEqual({ connected: false, chats: [] })
  })

  it('answers a bridge that sends no JSON as not connected', async () => {
    const status = await readBridgeStatus({ baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN }, bridgeInvalidAnswer())

    expect(status).toEqual({ connected: false, chats: [] })
  })
})

describe('storeWhatsAppAccount over the account service (WP-M14-15)', () => {
  it('stores the picked chat as the account of the user', async () => {
    const accounts: StoredAccount[] = []
    const account = await storeWhatsAppAccount(
      fakeDatabase([CHANNEL_ROW], accounts),
      'alice',
      'chat-1',
      { baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN },
      bridgeConnected(),
    )

    expect(account).toEqual({
      channel: 'whatsapp',
      externalId: 'chat-1',
      label: 'Depression Team',
      secretSet: false,
    })
    expect(JSON.stringify(account)).not.toContain(BRIDGE_TOKEN)
    expect(accounts).toEqual([
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'whatsapp',
        externalId: 'chat-1',
        label: 'Depression Team',
        secret: '',
      },
    ])
  })

  it('refuses a chat the bridge does not know', async () => {
    const accounts: StoredAccount[] = []
    let thrown: unknown

    try {
      await storeWhatsAppAccount(
        fakeDatabase([CHANNEL_ROW], accounts),
        'alice',
        'chat-99',
        { baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN },
        bridgeConnected(),
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(WhatsAppLinkingError)
    expect((thrown as WhatsAppLinkingError).code).toBe('unknown_chat')
    expect((thrown as WhatsAppLinkingError).message).not.toContain(BRIDGE_TOKEN)
    expect(accounts).toEqual([])
  })

  it('refuses a chat when the bridge is unreachable and stores nothing', async () => {
    const accounts: StoredAccount[] = []
    let thrown: unknown

    try {
      await storeWhatsAppAccount(
        fakeDatabase([CHANNEL_ROW], accounts),
        'alice',
        'chat-1',
        { baseUrl: BRIDGE_URL, token: BRIDGE_TOKEN },
        bridgeUnreachable(),
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(WhatsAppLinkingError)
    expect((thrown as WhatsAppLinkingError).code).toBe('unknown_chat')
    expect(accounts).toEqual([])
  })
})

describe('the WhatsApp Web routes (WP-M14-15)', () => {
  it('answers the chats of the bridge for the own channels page', async () => {
    const app = await buildApp({
      channels: [CHANNEL_ROW],
      accounts: [],
      whatsappFetch: bridgeConnected(),
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/whatsapp/status',
      headers: { 'x-test-user': 'alice' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      connected: true,
      chats: [
        { id: 'chat-1', label: 'Depression Team' },
        { id: 'chat-2', label: 'Office Chat' },
      ],
    })
    expect(response.body).not.toContain(BRIDGE_TOKEN)
  })

  it('answers an unreachable bridge as not connected, never an error', async () => {
    const app = await buildApp({
      channels: [CHANNEL_ROW],
      accounts: [],
      whatsappFetch: bridgeUnreachable(),
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/whatsapp/status',
      headers: { 'x-test-user': 'alice' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ connected: false, chats: [] })
    expect(response.body).not.toContain(BRIDGE_TOKEN)
  })

  it('stores the chat the user picked as their account', async () => {
    const accounts: StoredAccount[] = []
    const app = await buildApp({
      channels: [CHANNEL_ROW],
      accounts,
      whatsappFetch: bridgeConnected(),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/whatsapp',
      headers: { 'x-test-user': 'alice' },
      payload: { chatId: 'chat-2' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      channel: 'whatsapp',
      externalId: 'chat-2',
      label: 'Office Chat',
      secretSet: false,
    })
    expect(response.body).not.toContain(BRIDGE_TOKEN)
    expect(accounts).toEqual([
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'whatsapp',
        externalId: 'chat-2',
        label: 'Office Chat',
        secret: '',
      },
    ])
  })

  it('refuses a chat the bridge does not know with 422', async () => {
    const accounts: StoredAccount[] = []
    const app = await buildApp({
      channels: [CHANNEL_ROW],
      accounts,
      whatsappFetch: bridgeConnected(),
    })

    const refused = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/whatsapp',
      headers: { 'x-test-user': 'alice' },
      payload: { chatId: 'chat-99' },
    })

    expect(refused.statusCode).toBe(422)
    expect(refused.json<{ code: string }>().code).toBe('invalid_request')
    expect(refused.body).not.toContain(BRIDGE_TOKEN)
    expect(accounts).toEqual([])
  })

  it('refuses a body that misses the chat id with 422', async () => {
    const app = await buildApp({
      channels: [CHANNEL_ROW],
      accounts: [],
      whatsappFetch: bridgeConnected(),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/whatsapp',
      headers: { 'x-test-user': 'alice' },
      payload: {},
    })

    expect(response.statusCode).toBe(422)
    expect(response.json<{ code: string }>().code).toBe('invalid_request')
  })

  it('removes the own WhatsApp account with 204 and keeps foreign accounts', async () => {
    const accounts: StoredAccount[] = [
      {
        id: 'id-1',
        user_id: 'alice',
        channel: 'whatsapp',
        externalId: 'chat-1',
        label: 'Depression Team',
        secret: '',
      },
      {
        id: 'id-2',
        user_id: 'bob',
        channel: 'whatsapp',
        externalId: 'chat-2',
        label: 'Office Chat',
        secret: '',
      },
    ]
    const app = await buildApp({ channels: [CHANNEL_ROW], accounts })

    const foreign = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/whatsapp',
      headers: { 'x-test-user': 'eve' },
    })

    expect(foreign.statusCode).toBe(404)

    const own = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/accounts/whatsapp',
      headers: { 'x-test-user': 'alice' },
    })

    expect(own.statusCode).toBe(204)
    expect(own.body).toBe('')
    expect(accounts).toEqual([
      {
        id: 'id-2',
        user_id: 'bob',
        channel: 'whatsapp',
        externalId: 'chat-2',
        label: 'Office Chat',
        secret: '',
      },
    ])
  })

  it('answers 401 without a session', async () => {
    const app = await buildApp({ channels: [CHANNEL_ROW], accounts: [], whatsappFetch: bridgeConnected() })

    const anonymousStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/whatsapp/status',
    })

    expect(anonymousStatus.statusCode).toBe(401)
    expect(anonymousStatus.json<{ code: string }>().code).toBe('session_invalid')

    const anonymousLink = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/whatsapp',
      payload: { chatId: 'chat-1' },
    })

    expect(anonymousLink.statusCode).toBe(401)
    expect(anonymousLink.json<{ code: string }>().code).toBe('session_invalid')
  })
})
