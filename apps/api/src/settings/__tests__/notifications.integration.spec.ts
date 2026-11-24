import { eq, like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped minimum channels integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, settings } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type MinimumChannelsBody = { channels: string[] }
type ChannelPolicyBody = { requiredChannels: string[]; minimumChannelCount: number }
type AlarmBody = { toneEnabled: boolean; repeatSeconds: number }

const ntfyUrl = process.env.NTFY_URL
const ntfyTopic = process.env.NTFY_TOPIC

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'minimum channels API — GET and PUT /api/v1/settings/notifications/minimum-channels (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office' | 'reporter', string> = {
      admin: '',
      office: '',
      reporter: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
        key,
      ).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getMinimumChannels(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/notifications/minimum-channels',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function getAlarm(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/notifications/alarm',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putAlarm(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/alarm',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function putMinimumChannels(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/minimum-channels',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function getPolicy(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/notifications/channel-policy',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putPolicy(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/channel-policy',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      // ntfy is the only channel configured in this test, so a PUT of `['ntfy']`
      // is accepted and a PUT of any other kind is refused as unconfigured.
      process.env.NTFY_URL = 'https://ntfy.sh'
      process.env.NTFY_TOPIC = 'stoerdesk'

      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await db.delete(settings).where(like(settings.key, 'notifications.%'))

      const adminId = await userIdFor('admin-minimum@example.org')
      const officeId = await userIdFor('office-minimum@example.org')
      const reporterId = await userIdFor('reporter-minimum@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)
      cookies['reporter'] = await sessionCookieFor(reporterId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      process.env.NTFY_URL = ntfyUrl
      process.env.NTFY_TOPIC = ntfyTopic

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 to an anonymous GET and PUT', async () => {
      expect((await getMinimumChannels()).statusCode).toBe(401)
      expect((await putMinimumChannels('session=invalid', { channels: ['ntfy'] })).statusCode).toBe(
        401,
      )
    })

    it('refuses the read and write for roles without settings.read / settings.write', async () => {
      // `office` holds `settings.read` but not `settings.write`; `reporter_internal`
      // holds neither.
      const officeGet = await getMinimumChannels(cookies['office'])
      const officePut = await putMinimumChannels(cookies['office'], { channels: ['ntfy'] })
      const reporterGet = await getMinimumChannels(cookies['reporter'])
      const reporterPut = await putMinimumChannels(cookies['reporter'], { channels: ['ntfy'] })

      expect(officeGet.statusCode).toBe(200)
      expect(officePut.statusCode).toBe(403)
      expect(officePut.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(reporterGet.statusCode).toBe(403)
      expect(reporterGet.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(reporterPut.statusCode).toBe(403)
      expect(reporterPut.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the empty list before anything is configured', async () => {
      const response = await getMinimumChannels(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<MinimumChannelsBody>()).toEqual({ channels: [] })
    })

    it('stores a configured channel and returns it on the next read', async () => {
      const put = await putMinimumChannels(cookies['admin'], { channels: ['ntfy'] })

      expect(put.statusCode).toBe(200)
      expect(put.json<MinimumChannelsBody>()).toEqual({ channels: ['ntfy'] })

      const get = await getMinimumChannels(cookies['admin'])

      expect(get.json<MinimumChannelsBody>()).toEqual({ channels: ['ntfy'] })

      const stored = await db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, 'notifications.minimum_channels'))
        .limit(1)

      expect(onlyRow(stored, 'minimum channels row').value).toEqual(['ntfy'])
    })

    it('refuses an unconfigured channel with 422 invalid_request and keeps the stored value', async () => {
      const response = await putMinimumChannels(cookies['admin'], { channels: ['matrix'] })

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['channels'] },
      })
      expect((await getMinimumChannels(cookies['admin'])).json<MinimumChannelsBody>()).toEqual({
        channels: ['ntfy'],
      })
    })

    it('refuses a write from a reporter', async () => {
      const response = await putMinimumChannels(cookies['reporter'], { channels: ['ntfy'] })

      expect(response.statusCode).toBe(403)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the empty rule of the administration before the admin decides', async () => {
      const response = await getPolicy(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<ChannelPolicyBody>()).toEqual({
        requiredChannels: [],
        minimumChannelCount: 0,
      })
    })

    it('stores the required channels and the minimum number and reads them back', async () => {
      const put = await putPolicy(cookies['admin'], {
        requiredChannels: ['ntfy'],
        minimumChannelCount: 2,
      })

      expect(put.statusCode).toBe(200)
      expect(put.json<ChannelPolicyBody>()).toEqual({
        requiredChannels: ['ntfy'],
        minimumChannelCount: 2,
      })

      expect((await getPolicy(cookies['admin'])).json<ChannelPolicyBody>()).toEqual({
        requiredChannels: ['ntfy'],
        minimumChannelCount: 2,
      })

      const stored = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(like(settings.key, 'notifications.%'))

      expect(stored.find((row) => row.key === 'notifications.required_channels')?.value).toEqual([
        'ntfy',
      ])
      expect(
        stored.find((row) => row.key === 'notifications.minimum_channel_count')?.value,
      ).toBe(2)
    })

    it('refuses an unconfigured channel with 422 invalid_request and keeps the stored rule', async () => {
      const response = await putPolicy(cookies['admin'], {
        requiredChannels: ['matrix'],
        minimumChannelCount: 1,
      })

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['requiredChannels'] },
      })
      expect((await getPolicy(cookies['admin'])).json<ChannelPolicyBody>()).toEqual({
        requiredChannels: ['ntfy'],
        minimumChannelCount: 2,
      })
    })

    it('refuses the channel without an address of the user', async () => {
      const response = await putPolicy(cookies['admin'], {
        requiredChannels: ['signal'],
        minimumChannelCount: 1,
      })

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['requiredChannels'] },
      })
    })

    it('answers the sound of the installation and the interval of its repetition', async () => {
      const response = await getAlarm(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<AlarmBody>()).toEqual({
        toneEnabled: true,
        repeatSeconds: 60,
      })
    })

    it('replaces the sound and the interval of the installation', async () => {
      const put = await putAlarm(cookies['admin'], { toneEnabled: false, repeatSeconds: 30 })

      expect(put.statusCode).toBe(200)
      expect(put.json<AlarmBody>()).toEqual({ toneEnabled: false, repeatSeconds: 30 })

      expect((await getAlarm(cookies['admin'])).json<AlarmBody>()).toEqual({
        toneEnabled: false,
        repeatSeconds: 30,
      })
    })

    it('refuses an interval below 15 seconds and above 600 seconds', async () => {
      const tooSmall = await putAlarm(cookies['admin'], { toneEnabled: true, repeatSeconds: 5 })
      const tooBig = await putAlarm(cookies['admin'], { toneEnabled: true, repeatSeconds: 900 })

      expect(tooSmall.statusCode).toBe(400)
      expect(tooSmall.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['repeatSeconds'] },
      })
      expect(tooBig.statusCode).toBe(400)
    })

    it('refuses a negative minimum number', async () => {
      const response = await putPolicy(cookies['admin'], {
        requiredChannels: [],
        minimumChannelCount: -1,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['minimumChannelCount'] },
      })
    })
  },
)

