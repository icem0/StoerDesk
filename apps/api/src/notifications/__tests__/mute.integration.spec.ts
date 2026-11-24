import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped mute integration: ${testDatabase.reason}\n`)
}

const { settings, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the silence of one hour (WP-M25-04, §11.17)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: Awaited<ReturnType<typeof buildServer>> | undefined
    let cookie = ''
    let userId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [user] = await db
        .insert(users)
        .values({
          email: `mute-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      userId = user?.id ?? ''

      const session = await createSession(db, userId, 1)
      cookie = `session=${session.token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
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

    it('answers 401 without a session', async () => {
      app = await buildServer()

      try {
        const read = await app.inject({ method: 'GET', url: '/api/v1/notifications/mute' })
        const write = await app.inject({ method: 'POST', url: '/api/v1/notifications/mute' })

        expect(read.statusCode).toBe(401)
        expect(write.statusCode).toBe(401)
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('mutes the alarm for one hour and reads the end of the silence back', async () => {
      app = await buildServer()

      try {
        const before = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/mute',
          headers: { cookie },
        })

        expect(before.statusCode).toBe(200)
        expect(before.json<{ mutedUntil: string | null }>().mutedUntil).toBeNull()

        const mute = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/mute',
          headers: { cookie },
        })

        expect(mute.statusCode).toBe(200)

        const mutedUntil = mute.json<{ mutedUntil: string }>().mutedUntil
        const deadline = Date.parse(mutedUntil)

        expect(Number.isFinite(deadline)).toBe(true)
        expect(deadline - Date.now()).toBeGreaterThan(59 * 60 * 1000)
        expect(deadline - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)

        const after = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/mute',
          headers: { cookie },
        })

        expect(after.json<{ mutedUntil: string | null }>().mutedUntil).toBe(mutedUntil)

        // The silence lives on the server, under the key of the user.
        const row = await db
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, `notifications.mute.${userId}`))
          .limit(1)

        expect(row[0]?.value).toMatchObject({ mutedUntil })
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('does not extend a silence that is still running', async () => {
      app = await buildServer()

      try {
        const first = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/mute',
          headers: { cookie },
        })

        const second = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/mute',
          headers: { cookie },
        })

        expect(first.json<{ mutedUntil: string }>().mutedUntil).toBe(
          second.json<{ mutedUntil: string }>().mutedUntil,
        )
      } finally {
        await app.close()
        app = undefined
      }
    })
  },
)
