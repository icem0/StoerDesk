import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase-25 exit criterion: ${testDatabase.reason}\n`)
}

const { notificationAccounts, roles, settings, userRoles, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase-25 exit criterion — the alarm of the instance: the sound belongs to the installation, the silence to the user, the warning of the setup stands on every page (WP-M25-07)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: Awaited<ReturnType<typeof buildServer>> | undefined
    let adminCookie = ''
    let userCookie = ''
    let userId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [roleAdmin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      const [admin] = await db
        .insert(users)
        .values({
          email: `exit25-admin-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      const [user] = await db
        .insert(users)
        .values({
          email: `exit25-user-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
          givenName: 'Nora',
          familyName: 'Reich',
        })
        .returning({ id: users.id })

      userId = user?.id ?? ''

      if (roleAdmin !== undefined && admin !== undefined) {
        await db.insert(userRoles).values({ userId: admin.id, roleId: roleAdmin.id })
      }

      const adminSession = await createSession(db, admin?.id ?? '', 1)
      const userSession = await createSession(db, userId, 1)

      adminCookie = `session=${adminSession.token}`
      userCookie = `session=${userSession.token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.NTFY_URL = 'https://ntfy.sh'
      process.env.NTFY_TOPIC = 'stoerdesk'
      process.env.TELEGRAM_BOT_TOKEN = 'exit25-token'
      process.env.TELEGRAM_CHAT_ID = '@office'
    })

    afterAll(async () => {
      if (app !== undefined) {
        await app.close()
      }

      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('the sound and its interval are settings of the installation', async () => {
      app = await buildServer()

      try {
        const read = await app.inject({
          method: 'GET',
          url: '/api/v1/settings/notifications/alarm',
          headers: { cookie: adminCookie },
        })

        expect(read.statusCode).toBe(200)
        expect(read.json<{ toneEnabled: boolean; repeatSeconds: number }>()).toEqual({
          toneEnabled: true,
          repeatSeconds: 60,
        })

        const put = await app.inject({
          method: 'PUT',
          url: '/api/v1/settings/notifications/alarm',
          headers: { cookie: adminCookie },
          payload: { toneEnabled: false, repeatSeconds: 30 },
        })

        expect(put.statusCode).toBe(200)

        const row = await db
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, 'notifications.alarm_repeat_seconds'))
          .limit(1)

        expect(row[0]?.value).toBe(30)

        // Every signed-in user reads the sound of the installation — the band
        // of the alarm needs it (ADR-0048).
        const own = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/alarm',
          headers: { cookie: userCookie },
        })

        expect(own.statusCode).toBe(200)
        expect(own.json<{ toneEnabled: boolean }>().toneEnabled).toBe(false)
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('the silence of a user lasts one hour and silences the sound only', async () => {
      app = await buildServer()

      try {
        const mute = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/mute',
          headers: { cookie: userCookie },
        })

        expect(mute.statusCode).toBe(200)

        const mutedUntil = mute.json<{ mutedUntil: string }>().mutedUntil

        expect(Date.parse(mutedUntil) - Date.now()).toBeGreaterThan(59 * 60 * 1000)
        expect(Date.parse(mutedUntil) - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)

        // The silence does not touch the rule of the channels and blocks
        // nothing: the compliance of the user is still answered.
        const compliance = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/compliance',
          headers: { cookie: userCookie },
        })

        expect(compliance.statusCode).toBe(200)
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('the warning of the setup names the missing channels of every user', async () => {
      app = await buildServer()

      try {
        // The rule: the ntfy and the telegram channel must be set up.
        const put = await app.inject({
          method: 'PUT',
          url: '/api/v1/settings/notifications/channel-policy',
          headers: { cookie: adminCookie },
          payload: { requiredChannels: ['ntfy', 'telegram'], minimumChannelCount: 2 },
        })

        expect(put.statusCode).toBe(200)

        // The user has a confirmed ntfy account and no telegram account.
        await db.insert(notificationAccounts).values({
          userId,
          channel: 'ntfy',
          externalId: `stoerdesk-${randomUUID().slice(0, 8)}`,
          verifiedAt: new Date(),
        })

        const own = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/compliance',
          headers: { cookie: userCookie },
        })

        const answer = own.json<{ missing: string[]; compliant: boolean; channelCount: number }>()

        expect(answer.missing).toEqual(['telegram'])
        expect(answer.compliant).toBe(false)
        expect(answer.channelCount).toBe(1)

        // The administration sees the same state of the user.
        const list = await app.inject({
          method: 'GET',
          url: '/api/v1/admin/notifications/compliance',
          headers: { cookie: adminCookie },
        })

        expect(list.statusCode).toBe(200)

        const entry = list
          .json<{ users: Array<{ userId: string; missing: string[] }> }>()
          .users.find((candidate) => candidate.userId === userId)

        expect(entry?.missing).toEqual(['telegram'])
      } finally {
        await app.close()
        app = undefined
      }
    })
  },
)
