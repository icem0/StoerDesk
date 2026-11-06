import { randomUUID } from 'node:crypto'
import http from 'node:http'
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
import { enqueueOutbox, drainOutbox, type OutboxTicket } from '../outbox'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped notification exit criterion: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, ticketEvents, userRoles, users, outbox } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

function setCookieHeaders(response: WithCookieHeaders): string[] {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry))
  }

  return typeof raw === 'string' ? [raw] : []
}

type WithCookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

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
  'notification exit criterion — channel failure retries and falls back; history shows it (WP-M7-06)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance | undefined = undefined
    let sessionCookie = ''
    let ticketNo = ''
    let ticketId = ''

    /** Only the signal bridge is configured — the one failing channel of the criterion. */
    const signalEnv = (): Env =>
      loadEnv({
        SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
        SIGNAL_SOURCE_NUMBER: '+491234567890',
        SIGNAL_RECIPIENTS: '+491234567891',
      })

    /** Signal first, Matrix second — the escalation chain of `configuredChannels` order. */
    const signalMatrixEnv = (matrixHomeserver: string): Env =>
      loadEnv({
        SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
        SIGNAL_SOURCE_NUMBER: '+491234567890',
        SIGNAL_RECIPIENTS: '+491234567891',
        MATRIX_HOMESERVER: matrixHomeserver,
        MATRIX_ROOM_ID: '!exit-test:mock',
        MATRIX_ACCESS_TOKEN: 'exit-test-token',
      })

    const eventRows = async () =>
      db
        .select({
          type: ticketEvents.type,
          actorKind: ticketEvents.actorKind,
          payload: ticketEvents.payload,
        })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

    const detailEvents = async () => {
      const response = await app!.inject({
        method: 'GET',
        url: `/api/v1/tickets/${ticketNo}`,
        headers: { cookie: sessionCookie },
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<{
        events: Array<{ type: string; actorKind: string; payload: Record<string, unknown> }>
      }>()

      return body.events
    }

    const outboxRows = async () =>
      db
        .select({
          channel: outbox.channel,
          state: outbox.state,
          attempts: outbox.attempts,
        })
        .from(outbox)
        .where(eq(outbox.ticketId, ticketId))

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [insertedUser] = await db
        .insert(users)
        .values({
          email: 'exit@example.de',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (insertedUser === undefined || adminRole === undefined) {
        throw new Error('expected the seeded admin role and the exit user')
      }

      await db.insert(userRoles).values({ userId: insertedUser.id, roleId: adminRole.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id, name: objects.name })

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object!.id,
          status: 'NEW',
          priority: 'normal',
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      if (object === undefined || ticket === undefined) {
        throw new Error('expected one exit object and one exit ticket')
      }

      ticketId = ticket.id
      ticketNo = ticket.ticketNo

      await db.insert(ticketEvents).values({
        ticketId: ticketId,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      // The WP-M7-04 product path: one `PENDING` row per configured channel —
      // at report time only the failing signal bridge was configured.
      const queued = await enqueueOutbox(
        db,
        {
          id: ticket.id,
          ticketNo: ticket.ticketNo,
          priority: 'normal',
          objectName: object.name,
        } satisfies OutboxTicket,
        signalEnv(),
      )

      expect(queued).toBe(1)

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

    it('retries the failing channel three times and falls back to the next channel', async () => {
      const bodies: unknown[] = []

      const server = http.createServer((request, reply) => {
        let data = ''

        request.on('data', (chunk) => {
          data += chunk
        })

        request.on('end', () => {
          bodies.push(JSON.parse(data || '{}'))
          reply.writeHead(200)
          reply.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server.listen(48000 + Math.floor(Math.random() * 1000), '127.0.0.1', resolve),
      )

      const port = (server.address() as { port: number }).port

      const result = await drainOutbox(db, signalMatrixEnv(`http://127.0.0.1:${port}`))

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 1, attempts: 4 })

      const rows = await outboxRows()

      expect(onlyRow(rows.filter((row) => row.channel === 'signal'), 'signal row')).toEqual({
        channel: 'signal',
        state: 'FAILED',
        attempts: 3,
      })
      expect(onlyRow(rows.filter((row) => row.channel === 'matrix'), 'matrix row')).toEqual({
        channel: 'matrix',
        state: 'SENT',
        attempts: 1,
      })

      // The fallback really reached the next channel of the chain.
      expect(bodies).toHaveLength(1)
      expect((bodies[0] as { msgtype?: string }).msgtype).toBe('m.text')
    })

    it('shows the failed and the escalated delivery in the ticket history', async () => {
      const events = await detailEvents()

      expect(events.map((event) => event.type)).toContain('created')
      expect(events.filter((event) => event.type === 'created')).toHaveLength(1)

      const failed = events.filter(
        (event) => event.type === 'notification_failed' && event.payload.channel === 'signal',
      )

      expect(failed).toHaveLength(1)
      expect(failed[0]?.actorKind).toBe('system')
      expect(failed[0]?.payload).toEqual({ channel: 'signal', ticketNo, attempts: 3 })

      const sent = events.filter(
        (event) => event.type === 'notification_sent' && event.payload.channel === 'matrix',
      )

      expect(sent).toHaveLength(1)
      expect(sent[0]?.actorKind).toBe('system')
      expect(sent[0]?.payload).toEqual({ channel: 'matrix', ticketNo, attempts: 1 })
    })

    it('writes no event and no row a second time over the terminal rows', async () => {
      const eventsBefore = await eventRows()
      const rowsBefore = await outboxRows()

      const second = await drainOutbox(db, signalMatrixEnv('http://127.0.0.1:1/'))

      expect(second).toEqual({ sent: 0, failed: 0, fallback: 0, attempts: 0 })

      const eventsAfter = await eventRows()
      const rowsAfter = await outboxRows()

      expect(eventsAfter).toHaveLength(eventsBefore.length)
      expect(rowsAfter).toHaveLength(rowsBefore.length)

      const detail = await detailEvents()

      expect(
        detail.filter(
          (event) =>
            event.type === 'notification_failed' || event.type === 'notification_sent',
        ),
      ).toHaveLength(2)
    })

    it('ends the row of the last channel without a fallback and keeps the history readable', async () => {
      const lastOnly = signalEnv()
      const before = (await eventRows()).length

      await db.insert(outbox).values({
        ticketId,
        channel: 'signal',
        target: { ticketNo, priority: 'normal', objectName: 'Exit probe' },
      })

      const result = await drainOutbox(db, lastOnly)

      expect(result).toEqual({ sent: 0, failed: 1, fallback: 0, attempts: 3 })

      const events = await eventRows()

      expect(events).toHaveLength(before + 1)
      expect(events.filter((event) => event.type === 'notification_failed')).toHaveLength(2)

      const detail = await detailEvents()

      expect(detail.filter((event) => event.type === 'notification_failed')).toHaveLength(2)
      expect(detail.filter((event) => event.type === 'notification_sent')).toHaveLength(1)
    })
  },
)
