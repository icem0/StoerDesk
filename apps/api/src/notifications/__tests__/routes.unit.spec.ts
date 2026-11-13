import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationChannels } from '../../db/schema'
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
 * rows and upserts one row keyed by kind. The fake implements exactly those
 * Drizzle chains, so guard, secret and test-send behaviour run in memory.
 */
function fakeDatabase(store: StoredRow[], held: string[]): Db {
  const grantedQuery = {
    innerJoin: () => grantedQuery,
    where: async () => held.map((key) => ({ key })),
  }
  const overridesQuery = {
    innerJoin: () => ({ where: async () => [] as Array<{ key: string; effect: string }> }),
  }

  return {
    selectDistinct: () => ({ from: () => grantedQuery }),
    select: () => ({
      from: (table: unknown) => (table === notificationChannels ? store : overridesQuery),
    }),
    insert: (table: unknown) => {
      expect(table).toBe(notificationChannels)

      return {
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
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
      }
    },
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
    database: fakeDatabase(options.store, options.held),
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
})
