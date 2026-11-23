import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { transitionTicket } from '../workflow'

/**
 * The routes of the assignment (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-05): the office assigns the ticket to one technician and the
 * technician answers the assignment. Only the assigned technician may answer.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assignment routes integration: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, userRoles, users } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the routes of the assignment (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let officeCookie = ''
    let technicianId = ''
    let foreignTechnicianId = ''
    let officeUserId = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key).id
    }

    async function openWorkOrderTicket(): Promise<string> {
      const [object] = await db
        .insert(objects)
        .values({ objectNo: `A-${randomUUID().slice(0, 6)}`, name: 'Zuweisung' })
        .returning({ id: objects.id })
      const now = new Date()
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'NEW',
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      const id = ticket?.id ?? ''
      await transitionTicket({
        database: db,
        ticketId: id,
        event: 'review_started',
        actorUserId: officeUserId,
      })
      await transitionTicket({
        database: db,
        ticketId: id,
        event: 'work_order_set',
        actorUserId: officeUserId,
        payload: { text: 'AA 4711' },
      })

      return ticket?.ticketNo ?? ''
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      officeUserId = await userIdFor(`assign-office-${randomUUID()}@example.org`)
      technicianId = await userIdFor(`assign-tech-${randomUUID()}@example.org`)
      foreignTechnicianId = await userIdFor(`assign-foreign-${randomUUID()}@example.org`)

      await db.insert(userRoles).values([
        { userId: officeUserId, roleId: await roleIdFor('office') },
        { userId: technicianId, roleId: await roleIdFor('oncall') },
        { userId: foreignTechnicianId, roleId: await roleIdFor('oncall') },
      ])

      const session = await createSession(db, officeUserId, 1)
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

    it('assigns the ticket to the chosen technician', async () => {
      const ticketNo = await openWorkOrderTicket()

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assign`,
        headers: { cookie: officeCookie },
        payload: { userId: technicianId, acceptance: true },
      })

      expect(response.statusCode).toBe(200)

      const [row] = await db
        .select({
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
          assignedByUserId: tickets.assignedByUserId,
        })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))
        .limit(1)

      expect(row?.assignedUserId).toBe(technicianId)
      expect(row?.assignmentStatus).toBe('offered')
      expect(row?.assignedByUserId).toBe(officeUserId)
    })

    it('refuses an unknown technician with 400', async () => {
      const ticketNo = await openWorkOrderTicket()

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assign`,
        headers: { cookie: officeCookie },
        payload: { userId: randomUUID(), acceptance: true },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<{ code: string }>().code).toBe('invalid_request')
    })

    it('refuses the answer of a foreign technician with 403', async () => {
      const ticketNo = await openWorkOrderTicket()

      await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assign`,
        headers: { cookie: officeCookie },
        payload: { userId: technicianId, acceptance: true },
      })

      const foreignSession = await createSession(db, foreignTechnicianId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assignment-answer`,
        headers: { cookie: `session=${foreignSession.token}` },
        payload: { answer: 'accepted' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<{ code: string }>().code).toBe('not_assignee')
    })

    it('accepts the assignment as the assigned technician', async () => {
      const ticketNo = await openWorkOrderTicket()

      await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assign`,
        headers: { cookie: officeCookie },
        payload: { userId: technicianId, acceptance: true },
      })

      const session = await createSession(db, technicianId, 1)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/assignment-answer`,
        headers: { cookie: `session=${session.token}` },
        payload: { answer: 'accepted' },
      })

      expect(response.statusCode).toBe(200)

      const [row] = await db
        .select({ assignmentStatus: tickets.assignmentStatus, status: tickets.status })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))
        .limit(1)

      expect(row?.assignmentStatus).toBe('accepted')
      expect(row?.status).toBe('ACCEPTED')
    })
  },
)
