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
  process.stderr.write(`skipped ticket-transition management integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'ticket transitions — CRUD /api/v1/admin/transitions (integration)',
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

    function listTransitions(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/transitions',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function createTransition(cookie: string, payload: unknown) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/admin/transitions',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function patchTransition(cookie: string, id: string, payload: unknown) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/transitions/${id}`,
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function deleteTransition(cookie: string, id: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/transitions/${id}`,
        headers: { cookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-transitions@example.org')
      const officeId = await userIdFor('office-transitions@example.org')

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
      expect((await listTransitions()).statusCode).toBe(401)
    })

    it('lists the 22 seeded steps of PLAN.md §7 in the order of from_status and event_key', async () => {
      const response = await listTransitions(cookies.admin)
      expect(response.statusCode).toBe(200)
      const rows = response.json<{ transitions: unknown[] }>().transitions
      expect(rows).toHaveLength(22)
      const first = onlyRow(rows, 'first transition')
      expect(first).toMatchObject({
        fromStatus: 'ACCEPTED',
        toStatus: 'ACKNOWLEDGED',
        eventKey: 'acknowledged',
        active: true,
      })
    })

    it('refuses a malformed status key format with 400 invalid_request', async () => {
      const response = await createTransition(cookies.admin, {
        fromStatus: 'NEW',
        toStatus: 'review',
        eventKey: 'review_started',
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['toStatus'] },
      })
    })

    it('refuses a malformed event key format with 400 invalid_request', async () => {
      const response = await createTransition(cookies.admin, {
        fromStatus: 'NEW',
        toStatus: 'IN_REVIEW',
        eventKey: 'ReviewStarted',
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['eventKey'] },
      })
    })

    it('creates a new step with 201', async () => {
      const response = await createTransition(cookies.admin, {
        fromStatus: 'ACKNOWLEDGED',
        toStatus: 'NEW',
        eventKey: 'reopened_from_acknowledged',
        condition: null,
        active: true,
      })
      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({
        fromStatus: 'ACKNOWLEDGED',
        toStatus: 'NEW',
        eventKey: 'reopened_from_acknowledged',
        condition: null,
        active: true,
      })
    })

    it('refuses an unknown status key with 400 invalid_status_key', async () => {
      const response = await createTransition(cookies.admin, {
        fromStatus: 'PENDING_REVIEW',
        toStatus: 'NEW',
        eventKey: 'made_up_event',
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_status_key',
        params: { fields: ['fromStatus'] },
      })
    })

    it('refuses a duplicate (from_status, event_key) with 409 transition_duplicate', async () => {
      const response = await createTransition(cookies.admin, {
        fromStatus: 'NEW',
        toStatus: 'OFFERED',
        eventKey: 'review_started',
      })
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'transition_duplicate',
        params: {
          fields: ['fromStatus', 'eventKey'],
          fromStatus: 'NEW',
          eventKey: 'review_started',
        },
      })
    })

    it('edits the active switch of a seeded row with PATCH and keeps its id', async () => {
      const listed = await listTransitions(cookies.admin)
      expect(listed.statusCode).toBe(200)
      const rows = listed.json<{ transitions: unknown[] }>().transitions
      const target = rows.find((row) => {
        const candidate = row as { fromStatus?: string; eventKey?: string }

        return candidate.fromStatus === 'ACKNOWLEDGED' && candidate.eventKey === 'closed'
      })
      const id = (target as { id?: string })?.id ?? ''
      const response = await patchTransition(cookies.admin, id, { active: false })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        id,
        fromStatus: 'ACKNOWLEDGED',
        toStatus: 'CLOSED',
        eventKey: 'closed',
        active: false,
      })
    })

    it('refuses a PATCH that would duplicate (from_status, event_key) with 409', async () => {
      const listed = await listTransitions(cookies.admin)
      const rows = listed.json<{
        transitions: { id: string; fromStatus: string; eventKey: string }[]
      }>()
        .transitions
      const target = rows.find((row) => row.eventKey === 'closed')
      const id = target?.id ?? ''

      const response = await patchTransition(cookies.admin, id, { eventKey: 'cancelled' })
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'transition_duplicate',
        params: {
          fields: ['fromStatus', 'eventKey'],
          fromStatus: 'ACKNOWLEDGED',
          eventKey: 'cancelled',
        },
      })
    })

    it('answers 404 transition_not_found for an unknown id', async () => {
      const patch = await patchTransition(
        cookies.admin,
        '00000000-0000-0000-0000-000000000000',
        { active: false },
      )
      expect(patch.statusCode).toBe(404)
      expect(patch.json<ErrorResponseBody>()).toEqual({
        code: 'transition_not_found',
        params: { fields: ['id'] },
      })

      const del = await deleteTransition(
        cookies.admin,
        '00000000-0000-0000-0000-000000000000',
      )
      expect(del.statusCode).toBe(404)
      expect(del.json<ErrorResponseBody>()).toEqual({
        code: 'transition_not_found',
        params: { fields: ['id'] },
      })
    })

    it('answers 404 transition_not_found for a non-uuid id path parameter', async () => {
      const response = await deleteTransition(cookies.admin, 'NOT-A-UUID')
      expect(response.statusCode).toBe(404)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'transition_not_found',
        params: { fields: ['id'] },
      })
    })

    it('deletes the step the test added with 204', async () => {
      const added = await createTransition(cookies.admin, {
        fromStatus: 'NEW',
        toStatus: 'ACKNOWLEDGED',
        eventKey: 'jump_event',
      })
      expect(added.statusCode).toBe(201)
      const id = added.json<{ id: string }>().id

      expect((await deleteTransition(cookies.admin, id)).statusCode).toBe(204)
    })

    it('refuses a write without settings.write', async () => {
      const response = await createTransition(cookies.office, {
        fromStatus: 'NEW',
        toStatus: 'ACKNOWLEDGED',
        eventKey: 'office_forbidden',
      })
      expect(response.statusCode).toBe(403)
    })
  },
)
