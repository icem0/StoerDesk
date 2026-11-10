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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped close-detected-error integration: ${testDatabase.reason}\n`)
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
  'ticket close — comment and detected errors (integration)',
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

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)
      return `session=${session.token}`
    }

    function closeTicket(cookie: string, ticketNo: string, payload?: unknown) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/close`,
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function getTicket(ticketNo: string) {
      return app.inject({
        method: 'GET',
        url: `/api/v1/tickets/${ticketNo}`,
        headers: { cookie: officeCookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const officeId = await userIdFor('office-close-detected@example.org')

      await db.insert(userRoles).values([
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      officeCookie = await sessionCookieFor(officeId)

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
            objectNo: 'OBJ-CLOSE-1',
            name: 'Testobjekt Close',
            qrToken: 'qr-close-1',
          })
          .returning({ id: objects.id }),
        'object',
      )

      await db.insert(tickets).values({
        objectId: object.id,
        ticketNo: 'ST-2026-9900',
        status: 'ACKNOWLEDGED',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date(),
        receivedAt: new Date(),
        deadlineAt: new Date(),
        acknowledgedAt: new Date(),
      })
    })

    afterEach(async () => {
      await db.delete(tickets)
      await db.delete(objects)
    })

    it('closes without body (no comment, no detected errors)', async () => {
      const response = await closeTicket(officeCookie, 'ST-2026-9900')
      expect(response.statusCode).toBe(200)

      const detail = await getTicket('ST-2026-9900')
      expect(detail.json<{ ticket: { status: string } }>().ticket.status).toBe('CLOSED')

      const [stored] = await db
        .select({ detectedErrorKeys: tickets.detectedErrorKeys })
        .from(tickets)
        .where(eq(tickets.ticketNo, 'ST-2026-9900'))
        .limit(1)

      expect(stored?.detectedErrorKeys ?? []).toEqual([])
    })

    it('closes with comment and detected error keys', async () => {
      const response = await closeTicket(officeCookie, 'ST-2026-9900', {
        comment: 'Verkabelung ausgetauscht, alles ok.',
        detectedErrorKeys: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
        ],
      })
      expect(response.statusCode).toBe(200)

      const detail = await getTicket('ST-2026-9900')
      expect(detail.json<{ ticket: { status: string } }>().ticket.status).toBe('CLOSED')

      const [stored] = await db
        .select({ detectedErrorKeys: tickets.detectedErrorKeys })
        .from(tickets)
        .where(eq(tickets.ticketNo, 'ST-2026-9900'))
        .limit(1)

      expect(stored?.detectedErrorKeys ?? []).toEqual([
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ])
    })

    it('refuses close on a non-ACKNOWLEDGED ticket with 409', async () => {
      await db
        .update(tickets)
        .set({ status: 'NEW' })
        .where(eq(tickets.ticketNo, 'ST-2026-9900'))

      const response = await closeTicket(officeCookie, 'ST-2026-9900')
      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_transition',
        params: { ticketNo: 'ST-2026-9900', from: 'NEW', event: 'closed' },
      })
    })
  },
)
