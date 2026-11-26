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
import { createPendingCustomer } from '../registration'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase 31 exit integration: ${testDatabase.reason}\n`)
}

const { objectAssignments, objects, roles, tickets, userRoles, users, settings } = schema

type TicketListAnswer = { tickets?: { ticketNo: string }[] }

describe.skipIf(testDatabase.status === 'unavailable')(
  'the criterion of the phase 31 — the customer portal (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let customerCookie = ''
    let customerId = ''
    let ticketNo = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      // §19.13 (ADR-0062): the portal of the customer is switched off by
      // default — the tests of the portal switch it on.
      await db.insert(settings).values([
        { key: 'customer.portal_enabled', value: true },
        { key: 'customer.registration_enabled', value: true },
      ])
      await seedRbac(db)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const customer = await createPendingCustomer(db, {
        email: `phase31-${Date.now()}@example.org`,
        givenName: 'Erika',
        familyName: 'Mustermann',
        createdVia: 'qr_registration',
      })

      customerId = customer.userId

      // The customer confirms his registration over the link of the mail
      // (WP-M31-06) — only then is his account usable.
      await db.update(users).set({ active: true }).where(eq(users.id, customerId))

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `P31-${Date.now().toString().slice(-6)}`, name: 'Melder EG' })
        .returning({ id: objects.id })

      await db.insert(objectAssignments).values({
        objectId: object!.id,
        userId: customerId,
        createdByUserId: null,
      })

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object!.id,
          customerUserId: customerId,
          customerEmailNotifications: true,
          trainedPersonConfirmed: true,
          title: 'Der Rauchmelder piept',
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ ticketNo: tickets.ticketNo })

      ticketNo = ticket!.ticketNo

      customerCookie = `session=${(await createSession(db, customerId, 1)).token}`
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('the customer sees his own open ticket in the portal', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as TicketListAnswer

      expect(body.tickets?.map((ticket) => ticket.ticketNo)).toContain(ticketNo)
    })

    it('the customer reaches his own objects', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/objects',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)
      expect((answer.json() as { objects?: unknown[] }).objects?.length).toBe(1)
    })

    it('the customer is a user with the role customer', async () => {
      const rows = await db
        .select({ key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, customerId))

      expect(rows.map((row) => row.key)).toEqual(['customer'])
    })

    it('the customer does not reach the internal routes of the office', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(403)
    })
  },
)
