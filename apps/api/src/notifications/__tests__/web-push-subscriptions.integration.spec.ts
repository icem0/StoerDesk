import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped web-push subscription routes: ${testDatabase.reason}\n`)
}

const { users } = schema

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

    const subscription = {
      endpoint,
      keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
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
  },
)
