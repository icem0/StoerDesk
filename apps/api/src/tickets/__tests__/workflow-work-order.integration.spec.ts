import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

/**
 * The work order of the office (`specs/07-escalation.md` §7.10): the stage
 * selection sends the free text field of WP-M14-43, and the office route
 * validates it against the shared `workOrderRequestSchema` (WP-M14-76). The old
 * body `{ type, number }` answered `400 invalid_request` for every work order.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped work-order integration: ${testDatabase.reason}\n`)
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
  'the work order of the office (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let officeCookie = ''

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

    function setWorkOrder(cookie: string, payload: unknown) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/tickets/ST-2026-9901/work-order',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const officeId = await userIdFor('office-work-order@example.org')
      await db.insert(userRoles).values([
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      const session = await createSession(db, officeId, 1)
      officeCookie = `session=${session.token}`

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

    beforeEach(async () => {
      const object = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: 'OBJ-WORK-ORDER-1',
            name: 'Testobjekt Arbeitsauftrag',
            qrToken: 'qr-work-order-1',
          })
          .returning({ id: objects.id }),
        'object',
      )

      await db.insert(tickets).values({
        objectId: object.id,
        ticketNo: 'ST-2026-9901',
        status: 'IN_REVIEW',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date(),
        receivedAt: new Date(),
        deadlineAt: new Date(),
      })
    })

    afterEach(async () => {
      await db.delete(tickets)
      await db.delete(objects)
    })

    it('takes the free text of the work order and writes the column', async () => {
      const response = await setWorkOrder(officeCookie, { text: 'AA 4711' })

      expect(response.statusCode).toBe(200)

      const [stored] = await db
        .select({ status: tickets.status, workOrderText: tickets.workOrderText })
        .from(tickets)
        .where(eq(tickets.ticketNo, 'ST-2026-9901'))
        .limit(1)

      expect(stored?.status).toBe('WORK_ORDER_CREATED')
      expect(stored?.workOrderText).toBe('AA 4711')
    })

    it('refuses the old body of the work order with 400', async () => {
      const response = await setWorkOrder(officeCookie, { type: 'AA', number: '12345' })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>().code).toBe('invalid_request')

      const [stored] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.ticketNo, 'ST-2026-9901'))
        .limit(1)

      expect(stored?.status).toBe('IN_REVIEW')
    })
  },
)
