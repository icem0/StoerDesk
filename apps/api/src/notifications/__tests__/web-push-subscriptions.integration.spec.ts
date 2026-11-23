import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { loadEnv } from '../../config/env'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { readWebPushConfiguration } from '../config'
import { pruneDeadWebPushSubscriptions } from '../web-push-subscriptions'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped web-push subscription routes: ${testDatabase.reason}\n`)
}

const { users, pushSubscriptions, notificationChannels } = schema

const publicKey = 'BPm1NEFHt4bH8m8mV0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ'
const endpoint = 'https://push.example.org/secret/42'

interface ConfigBody {
  publicKey: string
  subscribed: boolean
  subscriptions: number
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the routes of the web-push subscriptions (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let ownerCookie = ''
    let otherCookie = ''

    async function userIdFor(email: string): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-web-push-user' })
        .returning({ id: users.id })

      return row!.id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    const config = (cookie?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/notifications/accounts/webpush',
        headers: cookie === undefined ? {} : { cookie },
      })

    const subscribe = (cookie: string, body: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/webpush',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      })

    const unsubscribe = (cookie: string, body: unknown) =>
      app.inject({
        method: 'DELETE',
        url: '/api/v1/notifications/accounts/webpush',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      })

    const check = (cookie: string, body: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/notifications/accounts/webpush/check',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      })

    const subscription = {
      endpoint,
      keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
    }

    // The VAPID keys of this file must not leak into another test file: the
    // worker shares `process.env`, and the private key of the test is no key
    // pair that `web-push` accepts (the adapter of the channel reads the
    // environment).
    const previousVapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const ownerId = await userIdFor('web-push-owner@example.org')
      const otherId = await userIdFor('web-push-other@example.org')
      ownerCookie = await sessionCookieFor(ownerId)
      otherCookie = await sessionCookieFor(otherId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.VAPID_PUBLIC_KEY = publicKey
      process.env.VAPID_PRIVATE_KEY = 'private-key-for-web-push-tests'
      process.env.VAPID_SUBJECT = 'mailto:admin@example.org'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      for (const [key, value] of [
        ['VAPID_PUBLIC_KEY', previousVapid.publicKey],
        ['VAPID_PRIVATE_KEY', previousVapid.privateKey],
        ['VAPID_SUBJECT', previousVapid.subject],
      ] as const) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('refuses the routes without a session', async () => {
      const read = await config()
      const write = await subscribe('', subscription)
      const remove = await unsubscribe('', { endpoint })

      expect(read.statusCode).toBe(401)
      expect(write.statusCode).toBe(401)
      expect(remove.statusCode).toBe(401)
    })

    it('answers the public key and no device before the first subscription', async () => {
      const response = await config(ownerCookie)

      expect(response.statusCode).toBe(200)
      expect(response.json<ConfigBody>()).toEqual({
        publicKey,
        subscribed: false,
        subscriptions: 0,
      })
    })

    it('refuses a body without a valid endpoint or keys', async () => {
      const missing = await subscribe(ownerCookie, { endpoint: 'not-a-url' })
      const noKeys = await subscribe(ownerCookie, { endpoint, keys: {} })

      expect(missing.statusCode).toBe(422)
      expect(missing.json<{ code?: string }>().code).toBe('invalid_request')
      expect(noKeys.statusCode).toBe(422)
    })

    it('stores a device once and counts it for the owner only', async () => {
      const stored = await subscribe(ownerCookie, subscription)

      expect(stored.statusCode).toBe(200)
      expect(stored.json<{ subscribed: boolean }>()).toEqual({ subscribed: true })

      const owner = await config(ownerCookie)
      const other = await config(otherCookie)

      expect(owner.json<ConfigBody>().subscriptions).toBe(1)
      expect(owner.json<ConfigBody>().subscribed).toBe(true)
      expect(other.json<ConfigBody>().subscriptions).toBe(0)
      expect(other.json<ConfigBody>().subscribed).toBe(false)
    })

    it('replaces the endpoint instead of counting the same device twice', async () => {
      const repeat = await subscribe(ownerCookie, {
        endpoint,
        keys: { p256dh: 'BPm1p256dh2', auth: 'authSecret43' },
      })

      expect(repeat.statusCode).toBe(200)
      expect((await config(ownerCookie)).json<ConfigBody>().subscriptions).toBe(1)
    })

    it('answers whether the server holds the device of this browser (WP-M14-144)', async () => {
      const own = await check(ownerCookie, { endpoint })
      const foreign = await check(otherCookie, { endpoint })
      const unknown = await check(ownerCookie, { endpoint: 'https://push.example.org/secret/77' })

      expect(own.statusCode).toBe(200)
      expect(own.json<{ registered: boolean }>()).toEqual({ registered: true })
      expect(foreign.json<{ registered: boolean }>()).toEqual({ registered: false })
      expect(unknown.json<{ registered: boolean }>()).toEqual({ registered: false })
    })

    it('refuses the check without a session or without an endpoint (WP-M14-144)', async () => {
      const withoutSession = await check('', { endpoint })
      const withoutEndpoint = await check(ownerCookie, {})

      expect(withoutSession.statusCode).toBe(401)
      expect(withoutEndpoint.statusCode).toBe(422)
      expect(withoutEndpoint.json<{ code?: string }>().code).toBe('invalid_request')
    })

    it('moves the endpoint of a shared device to the user who subscribes last', async () => {
      const moved = await subscribe(otherCookie, subscription)

      expect(moved.statusCode).toBe(200)
      expect((await config(otherCookie)).json<ConfigBody>().subscriptions).toBe(1)
      expect((await config(ownerCookie)).json<ConfigBody>().subscriptions).toBe(0)
    })

    it('removes only the own endpoint and stays idempotent', async () => {
      const foreign = await unsubscribe(ownerCookie, { endpoint })

      expect(foreign.statusCode).toBe(204)
      expect((await config(otherCookie)).json<ConfigBody>().subscriptions).toBe(1)

      const own = await unsubscribe(otherCookie, { endpoint })
      const again = await unsubscribe(otherCookie, { endpoint })

      expect(own.statusCode).toBe(204)
      expect(again.statusCode).toBe(204)
      expect((await config(otherCookie)).json<ConfigBody>().subscriptions).toBe(0)
    })

    it('uses one VAPID trio for the browser and the server (WP-M14-158)', async () => {
      const env = loadEnv(process.env)

      // Without a row of the administration the trio of the environment counts.
      expect((await config(ownerCookie)).json<ConfigBody>().publicKey).toBe(publicKey)

      await db.insert(notificationChannels).values({
        kind: 'webpush',
        name: 'webpush',
        enabled: true,
        config: { publicKey: 'rowPublicKey', subject: 'mailto:row@example.org' },
      })

      // A row without a secret leaves the trio of the environment untouched —
      // the private key of the environment never travels beside the public key
      // of the row.
      expect((await config(ownerCookie)).json<ConfigBody>().publicKey).toBe(publicKey)
      expect((await readWebPushConfiguration(db, env)).publicKey).toBe(publicKey)
      expect((await readWebPushConfiguration(db, env)).subject).toBe('mailto:admin@example.org')

      // A complete row wins as a whole.
      await db
        .update(notificationChannels)
        .set({ secret: 'rowPrivateKey' })
        .where(eq(notificationChannels.kind, 'webpush'))

      expect((await config(ownerCookie)).json<ConfigBody>().publicKey).toBe('rowPublicKey')
      expect((await readWebPushConfiguration(db, env)).privateKey).toBe('rowPrivateKey')
      expect((await readWebPushConfiguration(db, env)).subject).toBe('mailto:row@example.org')

      await db.delete(notificationChannels).where(eq(notificationChannels.kind, 'webpush'))
    })

    it('removes the dead devices and keeps the live ones (WP-M14-130a)', async () => {
      const dead = 'https://push.example.org/secret/dead'
      const live = 'https://push.example.org/secret/live'
      const userId = await userIdFor('web-push-dead@example.org')

      await db.insert(pushSubscriptions).values([
        { userId, endpoint: dead, p256dh: 'BPm1p256dh', auth: 'authSecret42' },
        { userId, endpoint: live, p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      ])

      const removed = await pruneDeadWebPushSubscriptions(db, [dead])

      expect(removed).toBe(1)
      expect(await pruneDeadWebPushSubscriptions(db, [dead])).toBe(0)
      expect(await pruneDeadWebPushSubscriptions(db, [])).toBe(0)

      const rows = await db
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))

      expect(rows.map((row) => row.endpoint)).toEqual([live])
    })
  },
)
