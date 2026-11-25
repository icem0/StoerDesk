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
  process.stderr.write(`skipped compliance integration: ${testDatabase.reason}\n`)
}

const { notificationAccounts, roles, userRoles, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the compliance of the users (WP-M24-15, §11.9)',
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
          email: `compliance-admin-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      const [technician] = await db
        .insert(users)
        .values({
          email: `compliance-user-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
          givenName: 'Nora',
          familyName: 'Reich',
        })
        .returning({ id: users.id })

      userId = technician?.id ?? ''

      if (roleAdmin !== undefined && admin !== undefined) {
        await db.insert(userRoles).values({
          userId: admin.id,
          roleId: roleAdmin.id,
        })
      }

      const adminSession = await createSession(db, admin?.id ?? '', 1)
      const userSession = await createSession(db, userId, 1)

      adminCookie = `session=${adminSession.token}`
      userCookie = `session=${userSession.token}`

      // One confirmed channel and one account that was never confirmed.
      await db.insert(notificationAccounts).values([
        {
          userId,
          channel: 'ntfy',
          externalId: `stoerdesk-${randomUUID().slice(0, 8)}`,
          verifiedAt: new Date(),
        },
        {
          userId,
          channel: 'telegram',
          externalId: '-555111222333',
        },
      ])

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.NTFY_URL = 'https://ntfy.sh'
      process.env.NTFY_TOPIC = 'stoerdesk'
      process.env.TELEGRAM_BOT_TOKEN = 'compliance-token'
      process.env.TELEGRAM_CHAT_ID = '@office'

      app = await buildServer()
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

    it('names the state of every channel of the user without his address', async () => {
      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/notifications/compliance',
        headers: { cookie: userCookie },
      })

      expect(response.statusCode).toBe(200)

      const answer = response.json<{
        userId: string
        name: string
        channels: Array<{ channel: string; state: string }>
        channelCount: number
        compliant: boolean
      }>()

      expect(answer.userId).toBe(userId)
      expect(answer.name).toBe('Nora Reich')
      expect(answer.channels.find((channel) => channel.channel === 'ntfy')?.state).toBe('ready')
      expect(answer.channels.find((channel) => channel.channel === 'telegram')?.state).toBe('linked')
      expect(answer.channels.find((channel) => channel.channel === 'matrix')?.state).toBe('missing')
      expect(answer.channelCount).toBe(1)

      // The address of the user never reaches the answer (§11.13).
      expect(response.body).not.toContain('stoerdesk-')
      expect(response.body).not.toContain('-555111222333')
    })

    it('names the required channels the user does not have set up', async () => {
      const put = await app!.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/channel-policy',
        headers: { cookie: adminCookie },
        payload: { requiredChannels: ['ntfy', 'telegram'], minimumChannelCount: 2 },
      })

      expect(put.statusCode).toBe(200)

      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/notifications/compliance',
        headers: { cookie: userCookie },
      })

      const answer = response.json<{ missing: string[]; compliant: boolean }>()

      expect(answer.missing).toEqual(['telegram'])
      expect(answer.compliant).toBe(false)

      const list = await app!.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications/compliance',
        headers: { cookie: adminCookie },
      })

      expect(list.statusCode).toBe(200)
      expect(list.json<{ users: Array<{ userId: string }> }>().users.length).toBeGreaterThan(0)
    })

    it('carries the rule of the administration in the answer of the user (WP-M35-01)', async () => {
      const put = await app!.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/channel-policy',
        headers: { cookie: adminCookie },
        payload: { requiredChannels: ['ntfy'], minimumChannelCount: 2 },
      })

      expect(put.statusCode).toBe(200)

      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/notifications/compliance',
        headers: { cookie: userCookie },
      })

      expect(response.statusCode).toBe(200)

      // The own page names the mandatory channels and the number of the
      // channels that are needed — the rule travels with the answer (§11.19).
      const answer = response.json<{
        policy: { requiredChannels: string[]; minimumChannelCount: number }
      }>()

      expect(answer.policy.requiredChannels).toEqual(['ntfy'])
      expect(answer.policy.minimumChannelCount).toBe(2)
    })
  },
)
