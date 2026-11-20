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
    let officeCookie = ''
    let objectId: string
    let ackTicketNo: string
    let commentTicketNo: string
    let internalTicketNo: string

    const now = new Date('2026-10-31T09:00:00.000Z')
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000)

    async function login(email = 'actor@example.de'): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'a-login-password-1234' },
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
      cookie = sessionCookie,
    ) {
      return app.inject({
        method,
        url: path,
        headers: { cookie },
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

    async function eventsOf(ticketNo: string): Promise<{ type: string; payload: unknown }[]> {
      const [ticket] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))
        .limit(1)

      if (ticket === undefined) {
        throw new Error(`ticket ${ticketNo} not found`)
      }

      const rows = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticket.id))

      return rows
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

      // A colleague without the key of the internal comment: the role `office`
      // holds `ticket.comment`, but not `ticket.comment.internal` (ADR-0034).
      const officeInserted = await db
        .insert(users)
        .values({
          email: 'office@example.de',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const officeUserId = onlyRow(officeInserted, 'office user').id

      const [officeRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'office'))

      if (officeRole === undefined) {
        throw new Error('expected the seeded office role')
      }

      await db.insert(userRoles).values({ userId: officeUserId, roleId: officeRole.id })

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
      await insertTicket('NEW')
      internalTicketNo = await insertTicket('ACCEPTED')

      // The server reads its database from the environment.
      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()

      sessionCookie = await login()
      officeCookie = await login('office@example.de')
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

    it('answers 401 without a session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${commentTicketNo}/comments`,
        payload: { clientUuid: '55555555-5555-4555-8555-555555555555', text: 'Ohne Session' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('the internal comment writes an event of its own type and replays on the second call', async () => {
      const clientUuid = '66666666-6666-4666-8666-666666666666'
      const eventsBefore = await countEvents(internalTicketNo)

      const first = await post('POST', `/api/v1/tickets/${internalTicketNo}/comments/internal`, {
        clientUuid,
        text: 'Nur für die Kollegen',
      })

      expect(first.statusCode).toBe(201)
      expect(first.json<{ replayed?: boolean }>().replayed).toBe(false)

      const eventsAfterFirst = await countEvents(internalTicketNo)
      expect(eventsAfterFirst).toBe(eventsBefore + 1)

      const written = await eventsOf(internalTicketNo)
      const note = written.find((event) => event.type === 'internal_comment')

      expect(note).toBeDefined()
      expect(note?.payload).toMatchObject({ text: 'Nur für die Kollegen' })

      const second = await post('POST', `/api/v1/tickets/${internalTicketNo}/comments/internal`, {
        clientUuid,
        text: 'Nur für die Kollegen',
      })

      expect(second.statusCode).toBe(200)
      expect(second.json<{ replayed?: boolean }>().replayed).toBe(true)

      const eventsAfterSecond = await countEvents(internalTicketNo)
      expect(eventsAfterSecond).toBe(eventsAfterFirst)
    })

    it('a colleague without the key cannot write the internal comment', async () => {
      const response = await post(
        'POST',
        `/api/v1/tickets/${internalTicketNo}/comments/internal`,
        { clientUuid: '77777777-7777-4777-8777-777777777777', text: 'Ohne Recht' },
        officeCookie,
      )

      expect(response.statusCode).toBe(403)
      expect(response.json<{ code?: string }>().code).toBe('forbidden')
    })

    it('a colleague without the key still writes the normal comment', async () => {
      const response = await post(
        'POST',
        `/api/v1/tickets/${internalTicketNo}/comments`,
        { clientUuid: '88888888-8888-4888-8888-888888888888', text: 'Kommentar für den Kunden' },
        officeCookie,
      )

      expect(response.statusCode).toBe(201)

      const written = await eventsOf(internalTicketNo)
      const comment = written.find((event) => event.type === 'comment')

      expect(comment?.payload).toMatchObject({ text: 'Kommentar für den Kunden' })
    })
  },
)
