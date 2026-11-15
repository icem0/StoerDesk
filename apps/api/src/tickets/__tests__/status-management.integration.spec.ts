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
import { seedTicketStatuses } from '../../db/seed/statuses'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket-status management integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, tickets } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'ticket statuses — CRUD /api/v1/admin/statuses (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

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

    function listStatuses(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/statuses',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function createStatus(cookie: string, payload: unknown) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/admin/statuses',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function patchStatus(cookie: string, key: string, payload: unknown) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/statuses/${key}`,
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function deleteStatus(cookie: string, key: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/statuses/${key}`,
        headers: { cookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await seedTicketStatuses(db)

      const adminId = await userIdFor('admin-statuses@example.org')
      const officeId = await userIdFor('office-statuses@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies.admin = await sessionCookieFor(adminId)
      cookies.office = await sessionCookieFor(officeId)

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

    it('answers 401 to an anonymous list', async () => {
      expect((await listStatuses()).statusCode).toBe(401)
    })

    it('lists the nine seeded statuses in their positions', async () => {
      const response = await listStatuses(cookies.admin)
      expect(response.statusCode).toBe(200)
      const statuses = response.json<{ statuses: unknown[] }>().statuses
      expect(statuses).toHaveLength(9)
      const first = onlyRow(statuses, 'first status')
      expect(first).toMatchObject({
        key: 'NEW',
        nameDe: 'Neu',
        nameEn: 'New',
        position: 1,
        active: true,
        isTerminal: false,
        ticketCount: 0,
      })
    })

    it('refuses a malformed key with 400 invalid_request', async () => {
      const response = await createStatus(cookies.admin, {
        key: 'pending_review',
        nameDe: 'In Prüfung',
        nameEn: 'In Review',
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['key'] },
      })
    })

    it('creates a new status key', async () => {
      const response = await createStatus(cookies.admin, {
        key: 'PENDING_REVIEW',
        nameDe: 'Zu Fäll',
        nameEn: 'To Tally',
        color: '#0f766e',
        position: 99,
      })
      expect(response.statusCode).toBe(201)
      expect(response.json<{ key: string; nameDe: string; ticketCount: number }>()).toMatchObject({
        key: 'PENDING_REVIEW',
        nameDe: 'Zu Fäll',
        nameEn: 'To Tally',
        color: '#0f766e',
        position: 99,
        active: true,
        isTerminal: false,
        ticketCount: 0,
      })
    })

    it('refuses a duplicate key with 409 status_key_taken', async () => {
      const response = await createStatus(cookies.admin, {
        key: 'PENDING_REVIEW',
        nameDe: 'Duplikat',
        nameEn: 'Duplicate',
      })
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'status_key_taken',
        params: { fields: ['key'] },
      })
    })

    it('edits names and color with PATCH', async () => {
      const response = await patchStatus(cookies.admin, 'PENDING_REVIEW', {
        nameDe: 'Zu Fäll (edited)',
        color: '#16a34a',
      })
      expect(response.statusCode).toBe(200)
      expect(response.json<{ nameDe: string; color: string; position: number }>()).toMatchObject({
        nameDe: 'Zu Fäll (edited)',
        nameEn: 'To Tally',
        color: '#16a34a',
        position: 99,
      })
    })

    it('refuses delete of a status a ticket carries with 409 status_in_use', async () => {
      const objectId = '00000000-0000-0000-0000-000000000000'

      await db
        .insert(schema.objects)
        .values({
          id: objectId,
          objectNo: 'OBJ-STATUS-1',
          name: 'Testobjekt Status',
          qrToken: 'qr-status-1',
        })

      await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: 'ST-2026-9998',
          status: 'NEW',
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: new Date(),
          receivedAt: new Date(),
          deadlineAt: new Date(),
        })

      const response = await deleteStatus(cookies.admin, 'NEW')
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'status_in_use',
        params: { fields: ['key'], key: 'NEW', usageCount: 1 },
      })
    })

    it('deletes an unused status', async () => {
      const response = await deleteStatus(cookies.admin, 'PENDING_REVIEW')
      expect(response.statusCode).toBe(204)

      const list = await listStatuses(cookies.admin)
      expect(list.json<{ statuses: unknown[] }>().statuses).toHaveLength(9)
    })

    it('answers 404 status_not_found for an unknown key', async () => {
      const patch = await patchStatus(cookies.admin, 'NOT_EXISTING', { nameDe: 'Neu' })
      expect(patch.statusCode).toBe(404)
      expect(patch.json<ErrorResponseBody>()).toEqual({
        code: 'status_not_found',
        params: { fields: ['key'] },
      })

      const del = await deleteStatus(cookies.admin, 'NOT_EXISTING')
      expect(del.statusCode).toBe(404)
    })

    it('keeps at least one active status', async () => {
      const listed = await listStatuses(cookies.admin)
      const keys = listed.json<{ statuses: { key: string }[] }>().statuses.map((row) => row.key)

      for (const key of keys.filter((key) => key !== 'NEW')) {
        expect((await patchStatus(cookies.admin, key, { active: false })).statusCode).toBe(200)
      }

      const last = await patchStatus(cookies.admin, 'NEW', { active: false })
      expect(last.statusCode).toBe(409)
      expect(last.json<ErrorResponseBody>()).toEqual({
        code: 'status_last_active',
        params: { fields: ['active'], key: 'NEW' },
      })
    })

    it('refuses a write without settings.write', async () => {
      const response = await createStatus(cookies.office, {
        key: 'OFFICE_FORBIDDEN',
        nameDe: 'Fehlt',
        nameEn: 'Missing',
      })
      expect(response.statusCode).toBe(403)
    })
  },
)
