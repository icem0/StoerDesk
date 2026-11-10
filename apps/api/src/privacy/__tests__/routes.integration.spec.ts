import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'
import { hashPassword } from '../../auth/password'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped privacy export and erasure routes: ${testDatabase.reason}\n`)
}

const { objects, roles, ticketEvents, tickets, users, userRoles } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'privacy export and erasure routes (http integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminCookie = ''
    let managerCookie = ''
    let ticketNo = ''
    let ticketId = ''
    let statusToken = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const stamp = Date.now()

      const [admin] = await db
        .insert(users)
        .values({
          email: `privacy-admin-${stamp}@example.de`,
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      if (!admin) throw new Error('expected the admin user')

      const [manager] = await db
        .insert(users)
        .values({
          email: `privacy-manager-${stamp}@example.de`,
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      if (!manager) throw new Error('expected the manager user')

      const roleRows = await db
        .select({ key: roles.key, id: roles.id })
        .from(roles)
        .where(inArray(roles.key, ['admin', 'manager']))

      const adminRole = roleRows.find((row) => row.key === 'admin')
      const managerRole = roleRows.find((row) => row.key === 'manager')

      if (!adminRole || !managerRole) throw new Error('expected the seeded admin and manager roles')

      await db.insert(userRoles).values({ userId: admin.id, roleId: adminRole.id })
      await db.insert(userRoles).values({ userId: manager.id, roleId: managerRole.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: '7301_01', name: 'Depot', city: 'Musterstadt' })
        .returning({ id: objects.id })

      if (!object) throw new Error('expected to insert the probe object')

      statusToken = 'token4exportcheck'

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object.id,
          ticketNo: 'ST-2026-0003',
          status: 'CLOSED',
          priority: 'normal',
          source: 'QR',
          reportedAt: new Date('2026-10-01T08:00:00.000Z'),
          receivedAt: new Date('2026-10-01T08:00:00.000Z'),
          deadlineAt: new Date('2026-10-04T08:00:00.000Z'),
          closedAt: new Date('2026-10-05T08:00:00.000Z'),
          reporterName: 'Test Reporter',
          reporterPhone: '01700000000',
          reporterEmail: 'reporter@example.de',
          statusToken,
        })
        .returning({ ticketNo: tickets.ticketNo, id: tickets.id })

      if (!ticket) throw new Error('expected to insert the ticket with reporter data')

      ticketNo = ticket.ticketNo
      ticketId = ticket.id

      await db.insert(ticketEvents).values({
        ticketId,
        type: 'created',
        actorKind: 'public',
        actorUserId: null,
        payload: { source: 'QR' },
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
      })

      adminCookie = `session=${(await createSession(db, admin.id, 1)).token}`
      managerCookie = `session=${(await createSession(db, manager.id, 1)).token}`

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('refuses the export without a session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/privacy/tickets/${ticketNo}/export`,
      })

      expect(response.statusCode).toBe(401)
      expect(JSON.parse(response.body).code).toBe('session_invalid')
    })

    it('refuses the export for a manager without user.write', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/privacy/tickets/${ticketNo}/export`,
        headers: { cookie: managerCookie },
      })

      expect(response.statusCode).toBe(403)
      expect(JSON.parse(response.body).code).toBe('forbidden')
    })

    it('exports the personal data without status token and event payload', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/privacy/tickets/${ticketNo}/export`,
        headers: { cookie: adminCookie },
      })

      expect(response.statusCode).toBe(200)

      const body = JSON.parse(response.body)

      expect(body.ticketNo).toBe(ticketNo)
      expect(body.reporter.name).toBe('Test Reporter')
      expect(body.reporter.phone).toBe('01700000000')
      expect(body.reporter.email).toBe('reporter@example.de')
      expect(body.photos).toHaveLength(0)
      expect(body.events.map((event: { type: string }) => event.type)).toContain('created')

      const answer = response.body
      expect(answer.includes(statusToken)).toBe(false)
      expect(answer.includes('payload')).toBe(false)
    })

    it('rejects an erase without a valid reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/privacy/tickets/${ticketNo}/erase`,
        headers: { cookie: adminCookie },
        body: { reason: 'too' },
      })

      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.body).code).toBe('invalid_request')

      const raw = await db
        .select({ reporterName: tickets.reporterName })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      expect(raw).toHaveLength(1)

      const [reporter] = raw

      if (!reporter) throw new Error('expected the ticket row')

      expect(reporter.reporterName).toBe('Test Reporter')
    })

    it('erases the reporter contact data and appends one audit event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/privacy/tickets/${ticketNo}/erase`,
        headers: { cookie: adminCookie },
        body: { reason: 'GDPR request of the data subject' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).alreadyErased).toBe(false)

      const raw = await db
        .select({
          reporterName: tickets.reporterName,
          reporterPhone: tickets.reporterPhone,
          reporterEmail: tickets.reporterEmail,
        })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      expect(raw).toHaveLength(1)

      const [reporter] = raw

      if (!reporter) throw new Error('expected the ticket row')

      expect(reporter.reporterName).toBeNull()
      expect(reporter.reporterPhone).toBeNull()
      expect(reporter.reporterEmail).toBeNull()

      const erasures = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.type, 'personal_data_erased'))

      expect(erasures).toHaveLength(1)

      const [erasure] = erasures

      if (!erasure) throw new Error('expected the erasure event')

      const payload = erasure.payload as { reasonLength: number }

      expect(payload.reasonLength).toBe('GDPR request of the data subject'.length)
    })

    it('does not add a second event on a repeat erase', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/privacy/tickets/${ticketNo}/erase`,
        headers: { cookie: adminCookie },
        body: { reason: 'the same subject request again' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).alreadyErased).toBe(true)

      const erasures = await db
        .select({ id: ticketEvents.id })
        .from(ticketEvents)
        .where(eq(ticketEvents.type, 'personal_data_erased'))

      expect(erasures).toHaveLength(1)
    })

    it('answers 404 for an unknown ticket', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/privacy/tickets/ST-9999-9999/erase',
        headers: { cookie: adminCookie },
        body: { reason: 'a reason that is long enough' },
      })

      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.body).code).toBe('ticket_not_found')
    })
  },
)
