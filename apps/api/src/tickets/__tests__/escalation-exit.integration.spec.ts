import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance } from 'fastify'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { hashPassword } from '../../auth/password'
import { evaluateEscalations } from '../escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation exit criterion: ${testDatabase.reason}\n`)
}

const { objects, tickets, users, userRoles, roles } = schema

type WithCookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

function setCookieHeaders(response: WithCookieHeaders): string[] {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry))
  }

  return typeof raw === 'string' ? [raw] : []
}

function cookiePair(response: WithCookieHeaders, name: string): string | undefined {
  for (const entry of setCookieHeaders(response)) {
    const [pair] = entry.split(';')

    if (pair !== undefined && pair.startsWith(`${name}=`)) {
      return pair
    }
  }

  return undefined
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'escalation exit criterion — overdue ticket escalates and appears in the history',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance | undefined = undefined
    let sessionCookie = ''
    let ticketNo = ''

    const now = new Date('2026-11-05T12:00:00.000Z')

    async function login(): Promise<string> {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'exit@example.de', password: 'a-login-password-1234' },
      })

      const pair = cookiePair(response, 'session')

      if (pair === undefined) {
        throw new Error('login did not set a session cookie')
      }

      return pair
    }

    async function getTicket(ticketNo: string) {
      return app!.inject({
        method: 'GET',
        url: `/api/v1/tickets/${ticketNo}`,
        headers: { cookie: sessionCookie },
      })
    }

    function deadlineEscalatedEvents(body: {
      events: Array<{ type: string; payload: { rule: string } }>
    }): typeof body.events {
      return body.events.filter(
        (event) => event.type === 'escalated' && event.payload.rule === 'deadline_exceeded',
      )
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const inserted = await db
        .insert(users)
        .values({
          email: 'exit@example.de',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const userId = inserted[0]!.id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (adminRole === undefined) {
        throw new Error('expected the seeded admin role')
      }

      await db.insert(userRoles).values({ userId, roleId: adminRole.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id })

      if (object === undefined) {
        throw new Error('object insert failed')
      }

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object.id,
          status: 'NEW',
          priority: 'normal',
          reportedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
          receivedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
          deadlineAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        })
        .returning({ ticketNo: tickets.ticketNo })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      ticketNo = ticket.ticketNo

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()
      sessionCookie = await login()
    })

    afterAll(async () => {
      if (app !== undefined) {
        await app.close()
      }
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('escalates an overdue ticket exactly once and shows it in the detail history', async () => {
      const firstScan = await evaluateEscalations(db, now)

      expect(firstScan.scanned).toBeGreaterThan(0)

      const first = await getTicket(ticketNo)

      expect(first.statusCode).toBe(200)

      const firstBody = first.json<{
        events: Array<{ type: string; payload: { rule: string } }>
        timeline: { state: string }
      }>()

      expect(deadlineEscalatedEvents(firstBody)).toHaveLength(1)
      expect(firstBody.timeline.state).toBe('red')

      const secondScan = await evaluateEscalations(db, now)

      expect(secondScan.fired).toBe(0)

      const second = await getTicket(ticketNo)

      expect(second.statusCode).toBe(200)

      const secondBody = second.json<{
        events: Array<{ type: string; payload: { rule: string } }>
        timeline: { state: string }
      }>()

      expect(deadlineEscalatedEvents(secondBody)).toHaveLength(1)
      expect(secondBody.timeline.state).toBe('red')
    })

    it('records the deadline_exceeded event with rule and threshold in the history', async () => {
      await evaluateEscalations(db, now)

      const response = await getTicket(ticketNo)

      expect(response.statusCode).toBe(200)

      const body = response.json<{
        events: Array<{
          type: string
          payload: { rule: string; thresholdAt: string; label: { de: string; en: string } }
        }>
      }>()

      const event = body.events.find(
        (event) => event.type === 'escalated' && event.payload.rule === 'deadline_exceeded',
      )

      expect(event).toBeDefined()
      expect(event!.payload.thresholdAt).toBeDefined()
      expect(event!.payload.label.de).toBe('Frist überschritten')
      expect(event!.payload.label.en).toBe('Deadline exceeded')
    })
  },
)
