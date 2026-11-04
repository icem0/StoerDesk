import { eq } from 'drizzle-orm'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { hashPassword } from '../../auth/password'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal actions routes: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets, users, userRoles, roles } = schema

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

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'internal action routes — idempotent acknowledge/comment/decline (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let sessionCookie = ''
    let objectId: string
    let ackTicketNo: string
    let commentTicketNo: string
    let newTicketNo: string

    const now = new Date('2026-10-31T09:00:00.000Z')
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000)

    async function login(): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'actor@example.de', password: 'a-login-password-1234' },
      })

      const pair = cookiePair(response, 'session')

      if (pair === undefined) {
        throw new Error('login did not set a session cookie')
      }

      return pair
    }

    async function post(
      method: 'POST',
      path: string,
      payload: Record<string, unknown>,
    ) {
      return app.inject({
        method,
        url: path,
        headers: { cookie: sessionCookie },
        payload,
      })
    }

    async function countEvents(ticketNo: string): Promise<number> {
      const [ticket] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))
        .limit(1)

      if (ticket === undefined) {
        throw new Error(`ticket ${ticketNo} not found`)
      }

      const rows = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticket.id))

      return rows.length
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const inserted = await db
        .insert(users)
        .values({
          email: 'actor@example.de',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const userId = onlyRow(inserted, 'actor user').id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (adminRole === undefined) {
        throw new Error('expected the seeded admin role')
      }

      await db.insert(userRoles).values({ userId, roleId: adminRole.id })

      const [objectRow] = await db
        .insert(objects)
        .values({ objectNo: '7201_01', name: 'Rathaus', city: 'Musterstadt' })
        .returning({ id: objects.id })

      const object = onlyRow([objectRow as NonNullable<typeof objectRow>], 'object')
      objectId = object.id

      const insertTicket = async (status: string) => {
        const ticket = onlyRow(
          await db
            .insert(tickets)
            .values({
              objectId,
              status,
              priority: 'normal',
              source: 'INTERNAL',
              reportedAt: now,
              receivedAt: now,
              deadlineAt: deadline,
            })
            .returning({ ticketNo: tickets.ticketNo }),
          'ticket',
        )

        return ticket.ticketNo
      }

      ackTicketNo = await insertTicket('ACCEPTED')
      commentTicketNo = await insertTicket('ACCEPTED')
      newTicketNo = await insertTicket('NEW')

      // The server reads its database from the environment.
      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()

      sessionCookie = await login()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('acknowledge with clientUuid writes one event and replays on the second call', async () => {
      const clientUuid = '11111111-1111-4111-8111-111111111111'
      const eventsBefore = await countEvents(ackTicketNo)

      const first = await post('POST', `/api/v1/tickets/${ackTicketNo}/acknowledge`, {
        result: 'fixed',
        note: 'Erledigt',
        clientUuid,
      })

      expect(first.statusCode).toBe(200)
      expect(first.json<{ replayed?: boolean }>().replayed).toBe(false)

      const eventsAfterFirst = await countEvents(ackTicketNo)
      expect(eventsAfterFirst).toBe(eventsBefore + 1)

      const second = await post('POST', `/api/v1/tickets/${ackTicketNo}/acknowledge`, {
        result: 'fixed',
        note: 'Erledigt',
        clientUuid,
      })

      expect(second.statusCode).toBe(200)
      expect(second.json<{ replayed?: boolean }>().replayed).toBe(true)

      const eventsAfterSecond = await countEvents(ackTicketNo)
      expect(eventsAfterSecond).toBe(eventsAfterFirst)
    })

    it('comment with clientUuid writes one comment event and replays on the second call', async () => {
      const clientUuid = '22222222-2222-4222-8222-222222222222'
      const eventsBefore = await countEvents(commentTicketNo)

      const first = await post('POST', `/api/v1/tickets/${commentTicketNo}/comments`, {
        clientUuid,
        text: 'Notiz zum Vorgang',
      })

      expect(first.statusCode).toBe(201)
      expect(first.json<{ replayed?: boolean }>().replayed).toBe(false)

      const eventsAfterFirst = await countEvents(commentTicketNo)
      expect(eventsAfterFirst).toBe(eventsBefore + 1)

      const second = await post('POST', `/api/v1/tickets/${commentTicketNo}/comments`, {
        clientUuid,
        text: 'Notiz zum Vorgang',
      })

      expect(second.statusCode).toBe(200)
      expect(second.json<{ replayed?: boolean }>().replayed).toBe(true)

      const eventsAfterSecond = await countEvents(commentTicketNo)
      expect(eventsAfterSecond).toBe(eventsAfterFirst)
    })

    it('decline on a NEW ticket answers 409 with from in params and writes no receipt', async () => {
      const clientUuid = '33333333-3333-4333-8333-333333333333'

      const response = await post('POST', `/api/v1/tickets/${newTicketNo}/decline`, {
        reason: 'Nicht zuständig',
        clientUuid,
      })

      expect(response.statusCode).toBe(409)
      const body = response.json<{ code?: string; params?: Record<string, unknown> }>()

      expect(body.code).toBe('invalid_transition')
      expect(body.params).toMatchObject({ ticketNo: newTicketNo, from: 'NEW', event: 'declined' })
    })

    it('keeps ticket_events unchanged after a declined conflict', async () => {
      const eventsBefore = await countEvents(newTicketNo)

      await post('POST', `/api/v1/tickets/${newTicketNo}/decline`, {
        reason: 'Noch einmal',
        clientUuid: '44444444-4444-4444-8444-444444444444',
      })

      const eventsAfter = await countEvents(newTicketNo)
      expect(eventsAfter).toBe(eventsBefore)
    })

    it('answers 401 without a session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${commentTicketNo}/comments`,
        payload: { clientUuid: '55555555-5555-4555-8555-555555555555', text: 'Ohne Session' },
      })

      expect(response.statusCode).toBe(401)
    })
  },
)
