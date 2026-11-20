import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationChannels, notificationChannelVerifications, notificationAccounts, pushSubscriptions } from '../../db/schema'
import type { NotificationChannel } from '../channels'
import { notificationChannelRoutes } from '../routes'

type Db = Database['database']

interface StoredRow {
  kind: string
  enabled: boolean
  label: string
  config: Record<string, string>
  secret: string
}

/**
 * No PostgreSQL: the route module only resolves permissions, reads the channel
 * rows and upserts one row keyed by kind — plus the one aggregated `execute` of
 * the channel status route (WP-M14-19). The fake implements exactly those
 * Drizzle chains, so guard, secret, test-send and status behaviour run in memory.
 */
function fakeDatabase(
  store: StoredRow[],
  held: string[],
  statusRows: Array<Record<string, unknown>> = [],
  accounts: Array<Record<string, unknown>> = [],
  subscriptions: Array<Record<string, unknown>> = [],
): Db {
  const verifications: Array<Record<string, unknown>> = []
  Object.assign(verifications, {
    where: () => verifications,
    limit: async () => verifications,
  })
  const grantedQuery = {
    innerJoin: () => grantedQuery,
    where: async () => held.map((key) => ({ key })),
  }
  const overridesQuery = {
    innerJoin: () => ({ where: async () => [] as Array<{ key: string; effect: string }> }),
  }
  const accountsQuery = {
    where: (_: unknown) => ({
      limit: async (count: number) => accounts.filter((row) => row.channel === 'ntfy').slice(0, count),
    }),
  }

  return {
    selectDistinct: () => ({ from: () => grantedQuery }),
    select: () => ({
      from: (table: unknown) => {
        if (table === notificationChannels) {
          return store
        }

        if (table === notificationChannelVerifications) {
          return verifications
        }

        if (table === notificationAccounts) {
          return accountsQuery
        }

        if (table === pushSubscriptions) {
          return { limit: async (_count: number) => subscriptions }
        }

        return overridesQuery
      },
    }),
    /** The aggregated channel-status query of the outbox (WP-M14-19). */
    execute: async (_: unknown) => statusRows,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (table === notificationChannelVerifications) {
            const existing = verifications.find((row) => row.kind === values.kind)

            if (existing !== undefined) {
              Object.assign(existing, values, set)
              return
            }

            verifications.push({ ...values, ...set })
            return
          }

          if (table === notificationAccounts) {
            const existing = accounts.find(
              (account) =>
                account.userId === values.userId && account.channel === values.channel,
            )

            if (existing !== undefined) {
              Object.assign(existing, values, set)
              return
            }

            accounts.push({
              userId: values.userId,
              channel: values.channel,
              externalId: values.externalId,
              label: values.label ?? '',
              secret: (values.secret as string | undefined) ?? '',
              updatedAt: values.updatedAt,
            })
            return
          }

          expect(table).toBe(notificationChannels)
          const kind = String(values.kind)
          const existing = store.find((row) => row.kind === kind)

          if (existing !== undefined) {
            Object.assign(existing, set)
            return
          }

          store.push({
            kind,
            enabled: (values.enabled as boolean | undefined) ?? true,
            label: (values.label as string | undefined) ?? '',
            config: (values.config as Record<string, string> | undefined) ?? {},
            secret: (values.secret as string | undefined) ?? '',
          })
        },
      }),
    }),
  } as unknown as Db
}

const row = (values: Partial<StoredRow> = {}): StoredRow => ({
  kind: 'telegram',
  enabled: true,
  label: '',
  config: { chatId: '@office' },
  secret: 'old-secret',
  ...values,
})

const apps: FastifyInstance[] = []

async function buildApp(options: {
  held: string[]
  store: StoredRow[]
  channels?: readonly NotificationChannel[]
  statusRows?: Array<Record<string, unknown>>
  accounts?: Array<Record<string, unknown>>
  subscriptions?: Array<Record<string, unknown>>
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
        mustChangePassword: false,
      }
    }
  })

  await app.register(notificationChannelRoutes, {
    database: fakeDatabase(
      options.store,
      options.held,
      options.statusRows ?? [],
      options.accounts ?? [],
      options.subscriptions ?? [],
    ),
    env: loadEnv({}),
    ...(options.channels === undefined ? {} : { channels: options.channels }),
  })

  apps.push(app)

  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('channel configuration routes — guards and secret (WP-M14-05)', () => {
  it('answers 401 without a session and 403 without notification.read', async () => {
    const anonymous = await (
      await buildApp({ held: ['notification.read'], store: [row()] })
    ).inject({ method: 'GET', url: '/api/v1/admin/channels' })

    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.json<{ code: string }>().code).toBe('session_invalid')

    const forbidden = await (
      await buildApp({ held: [], store: [row()] })
    ).inject({
      method: 'GET',
      url: '/api/v1/admin/channels',
      headers: { 'x-test-user': 'office' },
    })

    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json<{ code: string }>().code).toBe('forbidden')
  })

  it('lists the effective configuration and never the stored secret', async () => {
    const app = await buildApp({ held: ['notification.read'], store: [row()] })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/channels',
      headers: { 'x-test-user': 'admin' },
    })

    const body = response.json<{
      channels: Array<{ kind: string; secretSet: boolean }>
    }>()

    expect(response.statusCode).toBe(200)
    expect(body.channels).toContainEqual(
      expect.objectContaining({ kind: 'telegram', secretSet: true }),
    )
    expect(response.body).not.toContain('old-secret')
  })

  it('never answers the ntfy access token (WP-M14-51)', async () => {
    const app = await buildApp({
      held: ['notification.read'],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.mock', topic: 'office' },
          secret: 'tk_row',
        }),
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/channels',
      headers: { 'x-test-user': 'admin' },
    })

    const [ntfy] = response.json<{ channels: unknown[] }>().channels.filter((channel) => {
      return (channel as { kind?: string })?.kind === 'ntfy'
    })

    expect(ntfy).toBeInstanceOf(Object)
    expect(Object.keys(ntfy ?? {})).toEqual([
      'kind',
      'enabled',
      'label',
      'config',
      'secretSet',
      'verified',
    ])
    expect(response.body).not.toContain('tk_row')
  })

  it('writes the row and keeps the stored secret when the secret is empty', async () => {
    const store = [row()]
    const app = await buildApp({ held: ['notification.write'], store })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/channels/telegram',
      headers: { 'x-test-user': 'admin' },
      payload: { label: 'Office Telegram', config: { chatId: '@new' } },
    })

    expect(response.statusCode).toBe(200)
    expect(store).toHaveLength(1)
    expect(store[0]).toMatchObject({
      kind: 'telegram',
      label: 'Office Telegram',
      config: { chatId: '@new' },
      secret: 'old-secret',
    })

    const body = response.json<{ label: string; secretSet: boolean }>()
    expect(body).toMatchObject({ label: 'Office Telegram', secretSet: true })
    expect(response.body).not.toContain('old-secret')
  })

  it('replaces the stored secret with a non-empty value and creates a missing row', async () => {
    const store: StoredRow[] = []
    const app = await buildApp({ held: ['notification.write'], store })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/channels/ntfy',
      headers: { 'x-test-user': 'admin' },
      payload: {
        config: { url: 'https://ntfy.mock', topic: 'office' },
        secret: 'new-secret',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(store).toEqual([
      {
        kind: 'ntfy',
        enabled: true,
        label: '',
        config: { url: 'https://ntfy.mock', topic: 'office' },
        secret: 'new-secret',
      },
    ])
    expect(response.body).not.toContain('new-secret')
  })

  it('refuses a bad kind and a bad body with invalid_request', async () => {
    const app = await buildApp({ held: ['notification.write'], store: [row()] })

    const badKind = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/channels/pigeon',
      headers: { 'x-test-user': 'admin' },
      payload: { label: 'Pigeon' },
    })

    expect(badKind.statusCode).toBe(400)
    expect(badKind.json<{ code: string }>().code).toBe('invalid_request')

    const badBody = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/channels/telegram',
      headers: { 'x-test-user': 'admin' },
      payload: { config: { chatId: 42 } },
    })

    expect(badBody.statusCode).toBe(400)
    expect(badBody.json<{ code: string }>().code).toBe('invalid_request')
  })
})

describe('channel configuration routes — test send (WP-M14-05)', () => {
  it('answers a failing adapter with 200, delivered false and its code', async () => {
    const failing: NotificationChannel = {
      name: 'telegram',
      send: async () => {
        const error = new Error('adapter down') as Error & { code: string }
        error.code = 'http_error'
        throw error
      },
    }
    const app = await buildApp({
      held: ['notification.write'],
      store: [row()],
      channels: [failing],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/telegram/test',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delivered: false, code: 'http_error' })
    expect(response.body).not.toContain('adapter down')
  })

  it('answers delivered true when the adapter accepts the message', async () => {
    const accepting: NotificationChannel = { name: 'ntfy', send: async () => {} }
    const app = await buildApp({
      held: ['notification.write'],
      store: [row()],
      channels: [accepting],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/ntfy/test',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delivered: true })
  })

  it('answers push_no_subscription while no device is subscribed (WP-M15-10)', async () => {
    const accepting: NotificationChannel = { name: 'webpush', send: async () => {} }
    const app = await buildApp({
      held: ['notification.write'],
      store: [row({ kind: 'webpush' })],
      channels: [accepting],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/webpush/test',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delivered: false, code: 'push_no_subscription' })
  })

  it('sends the web push test message only when a device is subscribed (WP-M15-10)', async () => {
    const accepted: string[] = []
    const accepting: NotificationChannel = {
      name: 'webpush',
      send: async () => {
        accepted.push('sent')
      },
    }
    const app = await buildApp({
      held: ['notification.write'],
      store: [row({ kind: 'webpush' })],
      channels: [accepting],
      subscriptions: [{ id: '11111111-1111-4111-8111-111111111111' }],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/webpush/test',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delivered: true })
    expect(accepted).toEqual(['sent'])
  })

  it('needs notification.write for the test send', async () => {
    const app = await buildApp({
      held: ['notification.read'],
      store: [row()],
      channels: [{ name: 'telegram', send: async () => {} }],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/telegram/test',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('sends the test message with the access token of the stored row (WP-M14-51)', async () => {
    const seen: string[] = []
    const originalFetch = global.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(
      (_: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined
        seen.push(typeof headers?.authorization === 'string' ? headers.authorization : '')

        return new Response('{}', { status: 200 })
      },
    ) as unknown as typeof fetch

    const app = await buildApp({
      held: ['notification.write'],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.mock', topic: 'office' },
          secret: 'tk_row',
        }),
      ],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/channels/ntfy/test',
      headers: { 'x-test-user': 'admin' },
    })

    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch

    expect(response.json()).toEqual({ delivered: true })
    expect(seen).toEqual(['Bearer tk_row'])
  })
})

describe('the ntfy subscription of the user (WP-M14-13, stored topic of WP-M14-72b)', () => {
  it('answers the stored topic of the ntfy account of the user', async () => {
    const app = await buildApp({
      held: [],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
          secret: '',
        }),
      ],
      accounts: [
        {
          userId: 'admin-1',
          channel: 'ntfy',
          externalId: 'stoerdesk-stored',
          label: '',
          secret: '',
          updatedAt: new Date(),
        },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/ntfy',
      headers: { 'x-test-user': 'admin-1' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      publicUrl: 'https://ntfy.sh',
      topic: 'stoerdesk-stored',
      subscriptionUrl: 'https://ntfy.sh/stoerdesk-stored',
      deepLink: 'ntfy://ntfy.sh/stoerdesk-stored',
    })
  })

  it('provisions a user without an ntfy account with a fresh random topic', async () => {
    const accounts: Array<Record<string, unknown>> = []
    const app = await buildApp({
      held: [],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
          secret: '',
        }),
      ],
      accounts,
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/ntfy',
      headers: { 'x-test-user': 'admin-1' },
    })

    expect(response.statusCode).toBe(200)
    const topic = response.json<{ topic: string }>().topic

    expect(topic).toMatch(/^stoerdesk-[0-9a-f]{32}$/)
    expect(response.json()).toEqual({
      publicUrl: 'https://ntfy.sh',
      topic,
      subscriptionUrl: `https://ntfy.sh/${topic}`,
      deepLink: `ntfy://ntfy.sh/${topic}`,
    })
    expect(accounts).toEqual([
      expect.objectContaining({
        userId: 'admin-1',
        channel: 'ntfy',
        externalId: expect.stringMatching(/^stoerdesk-[0-9a-f]{32}$/),
      }),
    ])
  })

  it('keeps the stored topic of a provisioned account on a repeat visit', async () => {
    const accounts: Array<Record<string, unknown>> = []
    const app = await buildApp({
      held: [],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
          secret: '',
        }),
      ],
      accounts,
    })

    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/ntfy',
      headers: { 'x-test-user': 'admin-1' },
    })
    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/ntfy',
      headers: { 'x-test-user': 'admin-1' },
    })

    expect(first.json<{ topic: string }>().topic).toBe(second.json<{ topic: string }>().topic)
    expect(accounts).toHaveLength(1)
  })

  it('answers an empty subscription when the ntfy channel is not configured', async () => {
    const app = await buildApp({ held: [], store: [row()] })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/accounts/ntfy',
      headers: { 'x-test-user': 'admin-1' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      publicUrl: '',
      topic: '',
      subscriptionUrl: '',
      deepLink: '',
    })
  })

  it('answers 401 without a session', async () => {
    const app = await buildApp({
      held: [],
      store: [
        row({
          kind: 'ntfy',
          config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
          secret: '',
        }),
      ],
    })

    const response = await app.inject({ method: 'GET', url: '/api/v1/notifications/accounts/ntfy' })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ code: string }>().code).toBe('session_invalid')
  })
})

describe(
  'the own ntfy topic test behind the session alone (WP-M14-121, §11.11, §11.12)',
  () => {
    it('sends the test of the own topic without any permission key', async () => {
      const seenTopics: string[] = []
      const ntfyMock: NotificationChannel = {
        name: 'ntfy',
        send: async (_message, options) => {
          seenTopics.push(options?.topic ?? '')
        },
      }
      const app = await buildApp({
        held: [],
        store: [
          row({
            kind: 'ntfy',
            config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
            secret: '',
          }),
        ],
        channels: [ntfyMock],
        accounts: [
          {
            userId: 'admin-1',
            channel: 'ntfy',
            externalId: 'stoerdesk-stored',
            label: '',
            secret: '',
            updatedAt: new Date(),
          },
        ],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/ntfy/test',
        headers: { 'x-test-user': 'admin-1' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ delivered: true })
      expect(seenTopics).toEqual(['stoerdesk-stored'])
    })

    it('ignores a topic of the request body and keeps the stored one', async () => {
      const seenTopics: string[] = []
      const ntfyMock: NotificationChannel = {
        name: 'ntfy',
        send: async (_message, options) => {
          seenTopics.push(options?.topic ?? '')
        },
      }
      const app = await buildApp({
        held: [],
        store: [
          row({
            kind: 'ntfy',
            config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
            secret: '',
          }),
        ],
        channels: [ntfyMock],
        accounts: [
          {
            userId: 'admin-1',
            channel: 'ntfy',
            externalId: 'stoerdesk-stored',
            label: '',
            secret: '',
            updatedAt: new Date(),
          },
        ],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/ntfy/test',
        headers: { 'x-test-user': 'admin-1', 'content-type': 'application/json' },
        body: JSON.stringify({ topic: 'stoerdesk-other' }),
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ delivered: true })
      expect(seenTopics).toEqual(['stoerdesk-stored'])
    })

    it('answers a failing adapter with delivered false and its code', async () => {
      const ntfyMock: NotificationChannel = {
        name: 'ntfy',
        send: async () => {
          const error = new Error('adapter down') as Error & { code: string }
          error.code = 'http_401'
          throw error
        },
      }
      const app = await buildApp({
        held: [],
        store: [
          row({
            kind: 'ntfy',
            config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
            secret: '',
          }),
        ],
        channels: [ntfyMock],
        accounts: [
          {
            userId: 'admin-1',
            channel: 'ntfy',
            externalId: 'stoerdesk-stored',
            label: '',
            secret: '',
            updatedAt: new Date(),
          },
        ],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/ntfy/test',
        headers: { 'x-test-user': 'admin-1' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ delivered: false, code: 'http_401' })
      expect(response.body).not.toContain('adapter down')
    })

    it('writes nothing for a user without an ntfy account', async () => {
      const seenTopics: string[] = []
      const ntfyMock: NotificationChannel = {
        name: 'ntfy',
        send: async (_message, options) => {
          seenTopics.push(options?.topic ?? '')
        },
      }
      const app = await buildApp({
        held: [],
        store: [
          row({
            kind: 'ntfy',
            config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
            secret: '',
          }),
        ],
        channels: [ntfyMock],
        accounts: [],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/ntfy/test',
        headers: { 'x-test-user': 'admin-1' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ delivered: false, code: 'account_not_linked' })
      expect(seenTopics).toEqual([])
    })

    it('answers 401 without a session', async () => {
      const app = await buildApp({
        held: [],
        store: [
          row({
            kind: 'ntfy',
            config: { url: 'https://ntfy.sh', topic: 'stoerdesk' },
            secret: '',
          }),
        ],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/ntfy/test',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ code: string }>().code).toBe('session_invalid')
    })
  },
)

describe('the channel status of the outbox (WP-M14-19, §11.8)', () => {
  it('answers 401 without a session and 403 without notification.read', async () => {
    const anonymous = await (
      await buildApp({ held: ['notification.read'], store: [row()] })
    ).inject({ method: 'GET', url: '/api/v1/notifications/status' })

    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.json<{ code: string }>().code).toBe('session_invalid')

    const forbidden = await (
      await buildApp({ held: [], store: [row()] })
    ).inject({
      method: 'GET',
      url: '/api/v1/notifications/status',
      headers: { 'x-test-user': 'admin' },
    })

    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json<{ code: string }>().code).toBe('forbidden')
  })

  it('answers the pending and failed rows plus the last send and failure per channel', async () => {
    const lastFailure = new Date(2026, 10, 14, 9, 30)
    const lastSuccess = new Date(2026, 10, 14, 8, 0)

    const app = await buildApp({
      held: ['notification.read'],
      store: [row()],
      statusRows: [
        {
          channel: 'signal',
          last_sent_at: lastSuccess,
          last_failed_at: lastFailure,
          pending: '2',
          failed: '3',
        },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/status',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      channels: [
        {
          name: 'signal',
          lastSentAt: lastSuccess.toISOString(),
          lastFailedAt: lastFailure.toISOString(),
          lastError: null,
          pending: 2,
          failed: 3,
        },
      ],
    })
  })

  it('answers an empty list when the outbox has no rows', async () => {
    const app = await buildApp({ held: ['notification.read'], store: [row()] })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/status',
      headers: { 'x-test-user': 'admin' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ channels: [] })
  })
})
