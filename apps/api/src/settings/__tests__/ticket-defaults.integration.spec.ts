import { eq } from 'drizzle-orm'
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

/**
 * The standard priority and the list of the deviations (ADR-0029,
 * `specs/02-data-model.md` §4.3.2, WP-M14-134d): the standard is the setting
 * `ticket.default_priority`, the deviations live in the table
 * `object_priority_overrides` and hold only what differs from the standard.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket defaults integration: ${testDatabase.reason}\n`)
}

const { objectPriorityOverrides, objects, roles, settings, userRoles, users } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type DefaultsBody = { priority: string }
type OverridesBody = {
  overrides: { objectId: string; objectNo: string; objectName: string; priority: string }[]
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'ticket defaults API — the standard and the deviations (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }
    let objectId = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getDefaults(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/ticket-defaults',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function getOverrides(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/ticket-defaults/overrides',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putDefaults(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/ticket-defaults',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await db.delete(settings).where(eq(settings.key, 'ticket.default_priority'))

      const adminId = await userIdFor('admin-defaults@example.org')
      const officeId = await userIdFor('office-defaults@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)

      const inserted = await db
        .insert(objects)
        .values({ objectNo: 'DEFAULT_01', name: 'Klinik' })
        .returning({ id: objects.id })

      objectId = onlyRow(inserted, 'object').id

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 to an anonymous request', async () => {
      expect((await getDefaults()).statusCode).toBe(401)
      expect((await getOverrides()).statusCode).toBe(401)
      expect((await putDefaults('session=invalid', { priority: 'high' })).statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      const get = await getDefaults(cookies['office'])
      const put = await putDefaults(cookies['office'], { priority: 'high' })

      expect(get.statusCode).toBe(200)
      expect(put.statusCode).toBe(403)
      expect(put.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the standard of the instance', async () => {
      const response = await getDefaults(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<DefaultsBody>().priority).toBe('normal')
    })

    it('stores the standard and answers it on the next read', async () => {
      const put = await putDefaults(cookies['admin'], { priority: 'high' })

      expect(put.statusCode).toBe(200)
      expect(put.json<DefaultsBody>().priority).toBe('high')

      const get = await getDefaults(cookies['admin'])

      expect(get.json<DefaultsBody>().priority).toBe('high')
    })

    it('rejects a standard outside the four priorities', async () => {
      const response = await putDefaults(cookies['admin'], { priority: 'urgent' })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('lists the deviations with the number and the name of the object', async () => {
      await db.insert(objectPriorityOverrides).values({ objectId, priority: 'critical' })

      const response = await getOverrides(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<OverridesBody>().overrides).toEqual([
        {
          objectId,
          objectNo: 'DEFAULT_01',
          objectName: 'Klinik',
          priority: 'critical',
        },
        {
          objectId: '00000000-0000-4000-8000-000000000001',
          objectNo: 'OHNE-OBJEKT',
          objectName: 'Ohne Objekt',
          priority: 'low',
        },
      ])
    })

    it('removes the deviations that no longer deviate from the new standard', async () => {
      const put = await putDefaults(cookies['admin'], { priority: 'critical' })

      expect(put.statusCode).toBe(200)

      const rows = await db
        .select({ objectId: objectPriorityOverrides.objectId })
        .from(objectPriorityOverrides)

      expect(rows).toHaveLength(1)
      expect(rows[0]!.objectId).toBe('00000000-0000-4000-8000-000000000001')

      const list = await getOverrides(cookies['admin'])

      expect(list.json<OverridesBody>().overrides).toEqual([
        {
          objectId: '00000000-0000-4000-8000-000000000001',
          objectNo: 'OHNE-OBJEKT',
          objectName: 'Ohne Objekt',
          priority: 'low',
        },
      ])
    })
  },
)
