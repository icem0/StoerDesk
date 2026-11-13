import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { settings } from '../../db/schema'
import { TELEGRAM_LINKING_KEY } from '../telegram-linking'
import { notificationChannelRoutes } from '../routes'

type Db = Database['database']

interface SettingsRow {
  key: string
  value: Record<string, unknown>
}

interface AccountRow {
  userId: string
  channel: string
  externalId: string
  label: string
  secret: string
}

/**
 * No PostgreSQL: the linking reads and upserts the settings row and `storeAccount`
 * upserts and reads one `notification_accounts` row. The fake implements exactly
 * those Drizzle chains, so the exchange runs in memory.
 */
function fakeDatabase(settingsStore: SettingsRow[], accountsStore: AccountRow[]): Db {
  return {
    select: (_columns: unknown) => ({
      from: (table: unknown) => ({
        where: (_predicate: unknown) => ({
          limit: (_count: number) => (table === settings ? settingsStore : accountsStore),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (_conflict: { target: unknown; set: Record<string, unknown> }) => {
          if (table === settings) {
            const key = String(values.key)
            const existing = settingsStore.find((row) => row.key === key)

            if (existing !== undefined) {
              existing.value = values.value as Record<string, unknown>

              return
            }

            settingsStore.push({ key, value: values.value as Record<string, unknown> })

            return
          }

          const existing = accountsStore.find(
            (row) => row.userId === values.userId && row.channel === values.channel,
          )

          if (existing !== undefined) {
            existing.externalId = String(values.externalId)
            existing.label = (values.label as string | undefined) ?? existing.label

            if (values.secret !== undefined && values.secret !== '') {
              existing.secret = String(values.secret)
            }

            return
          }

          accountsStore.push({
            userId: String(values.userId),
            channel: String(values.channel),
            externalId: String(values.externalId),
            label: (values.label as string | undefined) ?? '',
            secret: (values.secret as string | undefined) ?? '',
          })
        },
      }),
    }),
  } as unknown as Db
}

const BOT_TOKEN = '123456:mock-bot-token'

const apps: FastifyInstance[] = []

async function buildApp(options: {
  settingsStore: SettingsRow[]
  accountsStore: AccountRow[]
  telegramFetch?: typeof fetch
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
    database: fakeDatabase(options.settingsStore, options.accountsStore),
    env: loadEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }),
    ...(options.telegramFetch === undefined ? {} : { telegramFetch: options.telegramFetch }),
  })

  apps.push(app)

  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

/** The code the settings row of the store currently holds. */
function pendingCode(settingsStore: SettingsRow[]): string {
  const row = settingsStore.find((candidate) => candidate.key === TELEGRAM_LINKING_KEY)

  return String(row?.value?.code ?? '')
}

/** A Bot API transport whose single update carries the code still pending. */
function botUpdatesForPendingCode(
  settingsStore: SettingsRow[],
  updateId: number,
  chatId: number,
  firstName: string,
): typeof fetch {
  const transport = vi.fn(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        result: [
          {
            update_id: updateId,
            message: { text: pendingCode(settingsStore), chat: { id: chatId, first_name: firstName } },
          },
        ],
      }),
      { status: 200 },
    ))

  return transport as unknown as typeof fetch
}

/** A Bot API transport whose single update carries a message without the code. */
function botUpdatesWithoutCode(updateId: number, text: string): typeof fetch {
  const transport = vi.fn(async () =>
    new Response(
      JSON.stringify({ ok: true, result: [{ update_id: updateId, message: { text } }] }),
      { status: 200 },
    ))

  return transport as unknown as typeof fetch
}

/** A Bot API transport that counts how often `getUpdates` is reached. */
function countingTransport(calls: { count: number }): typeof fetch {
  const transport = vi.fn(async () => {
    calls.count += 1

    return new Response('{}', { status: 200 })
  })

  return transport as unknown as typeof fetch
}

/** A Bot API transport that rejects the request with a non-ok status. */
function botUnreachable(): typeof fetch {
  const transport = vi.fn(async () => new Response('{}', { status: 502 }))

  return transport as unknown as typeof fetch
}

describe('the Telegram account linking (WP-M14-09)', () => {
  it('exchanges a one-time code for the chat id of the bot', async () => {
    const settingsStore: SettingsRow[] = []
    const accountsStore: AccountRow[] = []
    const app = await buildApp({
      settingsStore,
      accountsStore,
      telegramFetch: botUpdatesForPendingCode(settingsStore, 7, -5551112223334445, 'Alice'),
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
      headers: { 'x-test-user': 'alice' },
    })

    expect(created.statusCode).toBe(200)
    const { code, expiresAt } = created.json<{ code: string; expiresAt: string }>()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000)
    expect(created.body).not.toContain(BOT_TOKEN)

    const pending = settingsStore.find((row) => row.key === TELEGRAM_LINKING_KEY)
    expect(pending).toEqual({ key: TELEGRAM_LINKING_KEY, value: { code, expiresAt, userId: 'alice', offset: 0 } })

    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code },
    })

    expect(redeemed.statusCode).toBe(200)
    expect(redeemed.json()).toEqual({
      channel: 'telegram',
      externalId: '-5551112223334445',
      label: 'Alice',
      secretSet: false,
    })
    expect(redeemed.body).not.toContain(BOT_TOKEN)
    expect(accountsStore).toEqual([
      { userId: 'alice', channel: 'telegram', externalId: '-5551112223334445', label: 'Alice', secret: '' },
    ])
    expect(pending?.value ?? {}).toMatchObject({ code: '', offset: 8 })

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code },
    })

    expect(reused.statusCode).toBe(422)
    expect(reused.json<{ code: string }>().code).toBe('invalid_request')
  })

  it('refuses a wrong submitted code before reaching the bot', async () => {
    const settingsStore: SettingsRow[] = []
    const accountsStore: AccountRow[] = []
    const calls = { count: 0 }
    const app = await buildApp({
      settingsStore,
      accountsStore,
      telegramFetch: countingTransport(calls),
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
      headers: { 'x-test-user': 'alice' },
    })

    expect(created.statusCode).toBe(200)

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code: 'XXXXXX' },
    })

    expect(wrong.statusCode).toBe(422)
    expect(wrong.json<{ code: string }>().code).toBe('invalid_request')
    expect(calls.count).toBe(0)
    expect(accountsStore).toEqual([])
    expect(pendingCode(settingsStore)).toBe(created.json<{ code: string }>().code)
  })

  it('refuses an expired code and invalidates it', async () => {
    const expiredAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const settingsStore: SettingsRow[] = [
      {
        key: TELEGRAM_LINKING_KEY,
        value: { code: 'ABC234', expiresAt: expiredAt, userId: 'alice', offset: 0 },
      },
    ]
    const app = await buildApp({ settingsStore, accountsStore: [] })

    const expired = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code: 'ABC234' },
    })

    expect(expired.statusCode).toBe(422)
    expect(expired.json<{ code: string }>().code).toBe('invalid_request')
    expect(expired.body).not.toContain(BOT_TOKEN)
    expect(settingsStore[0]?.value ?? {}).toMatchObject({ code: '', expiresAt: '' })
  })

  it('keeps a foreign user from redeeming the code of another user', async () => {
    const settingsStore: SettingsRow[] = []
    const accountsStore: AccountRow[] = []
    const app = await buildApp({
      settingsStore,
      accountsStore,
      telegramFetch: botUpdatesForPendingCode(settingsStore, 7, -1, 'Bob'),
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
      headers: { 'x-test-user': 'alice' },
    })

    expect(created.statusCode).toBe(200)

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'bob' },
      payload: { code: created.json<{ code: string }>().code },
    })

    expect(foreign.statusCode).toBe(422)
    expect(foreign.json<{ code: string }>().code).toBe('invalid_request')
    expect(accountsStore).toEqual([])
  })

  it('refuses a code the bot never received', async () => {
    const settingsStore: SettingsRow[] = []
    const app = await buildApp({ settingsStore, accountsStore: [] })

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
      headers: { 'x-test-user': 'alice' },
    })

    expect(created.statusCode).toBe(200)
    const { code } = created.json<{ code: string }>()

    const withUpdates = await buildApp({
      settingsStore,
      accountsStore: [],
      telegramFetch: botUpdatesWithoutCode(7, `${code}x`),
    })

    const notFound = await withUpdates.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code },
    })

    expect(notFound.statusCode).toBe(422)
    expect(notFound.json<{ code: string }>().code).toBe('invalid_request')
    expect(notFound.body).not.toContain(BOT_TOKEN)
  })

  it('answers 401 without a session and 422 without a code in the body', async () => {
    const app = await buildApp({ settingsStore: [], accountsStore: [] })

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
    })

    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.json<{ code: string }>().code).toBe('session_invalid')

    const missingBody = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: {},
    })

    expect(missingBody.statusCode).toBe(422)
    expect(missingBody.json<{ code: string }>().code).toBe('invalid_request')
  })

  it('keeps the bot token out of an unreachable-bot answer', async () => {
    const settingsStore: SettingsRow[] = []
    const app = await buildApp({ settingsStore, accountsStore: [] })

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram/code',
      headers: { 'x-test-user': 'alice' },
    })

    expect(created.statusCode).toBe(200)

    const withUpdates = await buildApp({
      settingsStore,
      accountsStore: [],
      telegramFetch: botUnreachable(),
    })

    const unreachable = await withUpdates.inject({
      method: 'POST',
      url: '/api/v1/notifications/accounts/telegram',
      headers: { 'x-test-user': 'alice' },
      payload: { code: created.json<{ code: string }>().code },
    })

    expect(unreachable.statusCode).toBe(500)
    expect(unreachable.body).not.toContain(BOT_TOKEN)
  })
})
