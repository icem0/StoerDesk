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
  process.stderr.write(`skipped customer portal integration: ${testDatabase.reason}\n`)
}

const { objectAssignments, objects, roles, ticketEvents, tickets, userRoles, users } = schema

type TicketSummary = { ticketNo: string; objectName: string; open?: boolean }
type TicketListAnswer = { tickets?: TicketSummary[] }
type ErrorBody = { code?: string }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the portal of the customer (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let customerCookie = ''
    let otherCookie = ''
    let customerId = ''
    let ticketNo = ''
    let otherTicketNo = ''

    async function customerWithTicket(email: string): Promise<{ id: string; ticketNo: string }> {
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-portal-test' })
        .returning({ id: users.id })

      const id = onlyRow(user ? [user] : [], `user ${email}`).id

      const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'customer'))

      await db.insert(userRoles).values({ userId: id, roleId: role!.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `P${Date.now().toString().slice(-6)}`, name: 'Melder EG' })
        .returning({ id: objects.id })

      const objectId = onlyRow(object ? [object] : [], 'object').id

      await db.insert(objectAssignments).values({ objectId, userId: id })

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          customerUserId: id,
          title: 'Der Rauchmelder piept',
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ ticketNo: tickets.ticketNo, id: tickets.id })

      await db.insert(ticketEvents).values({
        ticketId: ticket!.id,
        type: 'internal_comment',
        actorKind: 'user',
        payload: { text: 'Nur für das Büro' },
      })

      // A report that was made before the registration: it carries his
      // address, but no customer — the portal finds it anyway (§19.5).
      await db.insert(tickets).values({
        objectId,
        reporterEmail: email,
        title: 'Die RWA springt nicht an',
        reportedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3_600_000),
      })

      return { id, ticketNo: ticket!.ticketNo }
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const customer = await customerWithTicket('portal-kunde@example.org')
      const other = await customerWithTicket('portal-anderer@example.org')

      customerId = customer.id
      ticketNo = customer.ticketNo

      otherTicketNo = other.ticketNo

      customerCookie = `session=${(await createSession(db, customer.id, 1)).token}`
      otherCookie = `session=${(await createSession(db, other.id, 1)).token}`
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('shows the own open tickets and nothing else', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as TicketListAnswer
      const numbers = body.tickets?.map((ticket) => ticket.ticketNo) ?? []

      // His own ticket and the report that carries his address — but never
      // the ticket of the other customer.
      expect(numbers).toContain(ticketNo)
      expect(numbers).not.toContain(otherTicketNo)
    })

    it('puts the closed tickets below the open ones and names the state', async () => {
      // A closed ticket of the customer (ADR-0061): the landing page shows the
      // open tickets first and the closed ones below them.
      const [own] = await db
        .select({ objectId: tickets.objectId })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      await db.insert(tickets).values({
        objectId: own!.objectId,
        customerUserId: customerId,
        title: 'Der Rauchmelder war still',
        status: 'CLOSED',
        reportedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3_600_000),
      })

      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as TicketListAnswer
      const rows = body.tickets ?? []
      const openRows = rows.filter((row) => row.open === true)
      const closedRows = rows.filter((row) => row.open === false)

      expect(closedRows.length).toBeGreaterThan(0)
      expect(openRows.length).toBeGreaterThan(0)
      // The open tickets come first: the last open row stands before the
      // first closed one.
      expect(rows.findIndex((row) => row.open === false)).toBeGreaterThan(
        rows.map((row) => row.open === true).lastIndexOf(true),
      )
    })

    it('does not answer the ticket of another customer', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: `/api/v1/customer/tickets/${ticketNo}`,
        headers: { cookie: otherCookie },
      })

      expect(answer.statusCode).toBe(404)
      expect((answer.json() as ErrorBody).code).toBe('ticket_not_found')
    })

    it('keeps the internal comment of the history out of the portal', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: `/api/v1/customer/tickets/${ticketNo}`,
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as { events?: { text: string }[] }

      expect(body.events?.some((event) => event.text.includes('Nur für das Büro'))).toBe(false)
    })

    it('lets the customer decide about the messages of his ticket', async () => {
      const answer = await app.inject({
        method: 'PATCH',
        url: `/api/v1/customer/tickets/${ticketNo}/notifications`,
        headers: { cookie: customerCookie, 'content-type': 'application/json' },
        payload: { emailNotifications: true },
      })

      expect(answer.statusCode).toBe(200)

      const [row] = await db.select().from(tickets).where(eq(tickets.ticketNo, ticketNo))

      expect(row?.customerEmailNotifications).toBe(true)

      const back = await app.inject({
        method: 'PATCH',
        url: `/api/v1/customer/tickets/${ticketNo}/notifications`,
        headers: { cookie: customerCookie, 'content-type': 'application/json' },
        payload: { emailNotifications: false },
      })

      expect(back.statusCode).toBe(200)

      const [after] = await db.select().from(tickets).where(eq(tickets.ticketNo, ticketNo))

      expect(after?.customerEmailNotifications).toBe(false)
    })

    it('does not let the customer change the ticket of somebody else', async () => {
      const answer = await app.inject({
        method: 'PATCH',
        url: `/api/v1/customer/tickets/${ticketNo}/notifications`,
        headers: { cookie: otherCookie, 'content-type': 'application/json' },
        payload: { emailNotifications: true },
      })

      expect(answer.statusCode).toBe(404)
    })

    it('shows the reports that carry his address', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as TicketListAnswer
      const numbers = body.tickets?.map((ticket) => ticket.ticketNo) ?? []

      expect(numbers).toContain(ticketNo)
      expect(numbers.length).toBeGreaterThan(1)
    })

    it('shows the own objects', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/objects',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as { objects?: { name: string }[] }

      expect(body.objects?.length).toBe(1)
      expect(body.objects?.[0]?.name).toBe('Melder EG')
    })

    it('refuses the internal routes of the office', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(403)
      expect((answer.json() as ErrorBody).code).toBe('forbidden')
      expect(customerId).not.toBe('')
    })
  },
)
