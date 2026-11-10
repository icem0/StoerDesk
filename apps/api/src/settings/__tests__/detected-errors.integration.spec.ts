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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped detected-errors integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, objects, tickets } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows
  if (!row) {
    throw new Error(`expected one ${what}`)
  }
  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'detected errors API — CRUD /api/v1/detected-errors (integration)',
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

    function getDetectedErrors(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/detected-errors',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function postDetectedErrors(cookie: string, payload: unknown) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/detected-errors',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function patchDetectedErrors(cookie: string, key: string, payload: unknown) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/detected-errors/${key}`,
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function deleteDetectedErrors(cookie: string, key: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/detected-errors/${key}`,
        headers: { cookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-detected-errors@example.org')
      const officeId = await userIdFor('office-detected-errors@example.org')
      const reporterId = await userIdFor('reporter-detected-errors@example.org')

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
      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 to anonymous GET', async () => {
      expect((await getDetectedErrors()).statusCode).toBe(401)
    })

    it('lists an empty catalog', async () => {
      const response = await getDetectedErrors(cookies['admin'])
      expect(response.statusCode).toBe(200)
      expect(response.json<{ detectedErrors: unknown[] }>().detectedErrors).toEqual([])
    })

    it('creates a detected error', async () => {
      const response = await postDetectedErrors(cookies['admin'], {
        key: 'verkabelung_defekt',
        labelDe: 'Verkabelung defekt',
        labelEn: 'Wiring defective',
      })
      expect(response.statusCode).toBe(201)
      const body = response.json<{
        key: string; labelDe: string; labelEn: string
      }>()
      expect(body.key).toBe('verkabelung_defekt')
      expect(body.labelDe).toBe('Verkabelung defekt')
      expect(body.labelEn).toBe('Wiring defective')
    })

    it('rejects a duplicate key with 409 detected_error_key_taken', async () => {
      const response = await postDetectedErrors(cookies['admin'], {
        key: 'verkabelung_defekt',
        labelDe: 'Duplikat',
        labelEn: 'Duplicate',
      })
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'detected_error_key_taken',
        params: { fields: ['key'] },
      })
    })

    it('edits labels of an existing key', async () => {
      const response = await patchDetectedErrors(cookies['admin'], 'verkabelung_defekt', {
        labelDe: 'Verkabelung defekt (bearbeitet)',
        labelEn: 'Wiring defective (edited)',
      })
      expect(response.statusCode).toBe(200)
      const body = response.json<{ labelDe: string; labelEn: string }>()
      expect(body.labelDe).toBe('Verkabelung defekt (bearbeitet)')
      expect(body.labelEn).toBe('Wiring defective (edited)')
    })

    it('archives and reactivates a key', async () => {
      const archived = await patchDetectedErrors(cookies['admin'], 'verkabelung_defekt', {
        archivedAt: '2026-01-01T00:00:00Z',
      })
      expect(archived.statusCode).toBe(200)
      expect(archived.json<{ archivedAt: string | null }>().archivedAt).toBe(
        '2026-01-01T00:00:00.000Z',
      )

      const reactivated = await patchDetectedErrors(cookies['admin'], 'verkabelung_defekt', {
        archivedAt: null,
      })
      expect(reactivated.statusCode).toBe(200)
      expect(reactivated.json<{ archivedAt: string | null }>().archivedAt).toBeNull()
    })

    it('refuses delete of a key in use with 409 detected_error_in_use', async () => {
      await db
        .insert(objects)
        .values({
          id: '00000000-0000-0000-0000-000000000000',
          objectNo: 'OBJ-DETECTED-1',
          name: 'Testobjekt Detected',
          qrToken: 'qr-detected-1',
        })

      await db
        .insert(tickets)
        .values({
          objectId: '00000000-0000-0000-0000-000000000000',
          ticketNo: 'ST-2026-9999',
          status: 'CLOSED',
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: new Date(),
          receivedAt: new Date(),
          deadlineAt: new Date(),
          detectedErrorKeys: ['verkabelung_defekt'],
        })

      const response = await deleteDetectedErrors(cookies['admin'], 'verkabelung_defekt')
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'detected_error_in_use',
        params: { fields: ['key'], key: 'verkabelung_defekt', usageCount: 1 },
      })
    })

    it('deletes an unused key', async () => {
      await postDetectedErrors(cookies['admin'], {
        key: 'unbenutzt',
        labelDe: 'Unbenutzt',
        labelEn: 'Unused',
      })
      const response = await deleteDetectedErrors(cookies['admin'], 'unbenutzt')
      expect(response.statusCode).toBe(204)

      const list = await getDetectedErrors(cookies['admin'])
      expect(list.json<{ detectedErrors: unknown[] }>().detectedErrors).toHaveLength(1)
    })

    it('returns 404 for unknown key on PATCH and DELETE', async () => {
      const patch = await patchDetectedErrors(cookies['admin'], 'not_existing', {
        labelDe: 'Neu',
      })
      expect(patch.statusCode).toBe(404)
      expect(patch.json<ErrorResponseBody>()).toEqual({
        code: 'detected_error_not_found',
        params: { fields: ['key'] },
      })

      const del = await deleteDetectedErrors(cookies['admin'], 'not_existing')
      expect(del.statusCode).toBe(404)
    })

    it('refuses write for a role without settings.write', async () => {
      const put = await postDetectedErrors(cookies['office'], {
        key: 'office_should_fail',
        labelDe: 'Fail',
        labelEn: 'Fail',
      })
      expect(put.statusCode).toBe(403)
    })
  },
)
