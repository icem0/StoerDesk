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
 * The format guard of a `:ticketNo` path parameter (`PLAN.md` §15, SEC-015,
 * WP-M9-29). ADR-0027 widened `ticketNoSchema` to the year-free number and the
 * legacy one — the guard still filters every malformed number before the
 * lookup, so a path traversal attempt never reaches the database.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket number guard integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, objects, tickets } = schema

const MALFORMED = ['st-0001', 'ST-1', 'ST-2026-26-1', 'ST-0001%2F..%2Fetc', 'ST-0001;drop']

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows
  if (!row) {
    throw new Error(`expected one ${what}`)
  }
  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'a malformed ticket number is rejected at every entry point (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let officeCookie = ''
    let adminCookie = ''

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

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const officeId = await userIdFor('office-ticket-no-guard@example.org')
      const adminId = await userIdFor('admin-ticket-no-guard@example.org')
      await db.insert(userRoles).values([
        { userId: officeId, roleId: await roleIdFor('office') },
        { userId: adminId, roleId: await roleIdFor('admin') },
      ])

      officeCookie = `session=${(await createSession(db, officeId, 1)).token}`
      adminCookie = `session=${(await createSession(db, adminId, 1)).token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const object = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: 'OBJ-NO-GUARD-1',
            name: 'Testobjekt Nummernschutz',
            qrToken: 'qr-ticket-no-guard-0001',
          })
          .returning({ id: objects.id }),
        'object',
      )

      await db.insert(tickets).values({
        objectId: object.id,
        ticketNo: 'ST-0001',
        status: 'NEW',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date(),
        receivedAt: new Date(),
        deadlineAt: new Date(),
        statusToken: 'guardStatusToken000001',
      })
    })

    afterAll(async () => {
      await db.delete(tickets)
      await db.delete(objects)
      await app.close()
      await client.end({ timeout: 2 })
      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function expectRejected(response: { statusCode: number; body: string }): Promise<void> {
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.body)).toEqual({
        code: 'invalid_request',
        params: { fields: ['ticketNo'] },
      })
    }

    it('rejects the number at the detail route', async () => {
      for (const ticketNo of MALFORMED) {
        await expectRejected(
          await app.inject({
            method: 'GET',
            url: `/api/v1/tickets/${ticketNo}`,
            headers: { cookie: officeCookie },
          }),
        )
      }
    })

    it('rejects the number at the comment route of the internal user', async () => {
      for (const ticketNo of MALFORMED) {
        await expectRejected(
          await app.inject({
            method: 'POST',
            url: `/api/v1/tickets/${ticketNo}/comments`,
            headers: { cookie: officeCookie },
            payload: {
              clientUuid: '22222222-2222-4222-8222-222222222222',
              text: 'Nachricht mit ungültiger Nummer',
            },
          }),
        )
      }
    })

    it('rejects the number at the workflow route', async () => {
      for (const ticketNo of MALFORMED) {
        await expectRejected(
          await app.inject({
            method: 'POST',
            url: `/api/v1/tickets/${ticketNo}/review`,
            headers: { cookie: officeCookie },
          }),
        )
      }
    })

    it('rejects the number at the external work-order route', async () => {
      for (const ticketNo of MALFORMED) {
        await expectRejected(
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/tickets/${ticketNo}/work-order`,
            headers: { cookie: officeCookie },
            payload: { text: 'AA 4711' },
          }),
        )
      }
    })

    it('rejects the number at the delete route', async () => {
      for (const ticketNo of MALFORMED) {
        await expectRejected(
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/tickets/${ticketNo}`,
            headers: { cookie: adminCookie },
          }),
        )
      }
    })

    it('lets a valid number through to the lookup', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tickets/ST-0001',
        headers: { cookie: officeCookie },
      })

      expect(response.statusCode).toBe(200)
    })
  },
)
