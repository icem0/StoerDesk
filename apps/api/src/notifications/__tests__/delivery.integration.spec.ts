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

/**
 * The delivery problems of the channels (`specs/10-notifications.md` §11.8,
 * WP-M14-161a): the admin reads the problems and the lost messages,
 * acknowledges them, and a failure after the acknowledgement opens the
 * problem again.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped delivery problems integration: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, userRoles, users, outbox } = schema

type WithCookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

function cookiePair(response: WithCookieHeaders, name: string): string | undefined {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']
  const entries = Array.isArray(raw) ? raw.map((entry) => String(entry)) : typeof raw === 'string' ? [raw] : []

  for (const entry of entries) {
    const [pair] = entry.split(';')

    if (pair !== undefined && pair.startsWith(`${name}=`)) {
      return pair
    }
  }

  return undefined
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the delivery problems of the channels (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance | undefined = undefined
    let sessionCookie = ''
    let ticketId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [insertedUser] = await db
        .insert(users)
        .values({
          email: 'delivery@example.de',
          givenName: 'Ada',
          familyName: 'Delivery',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (insertedUser === undefined || adminRole === undefined) {
        throw new Error('expected the seeded admin role and the delivery user')
      }

      await db.insert(userRoles).values({ userId: insertedUser.id, roleId: adminRole.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `DEL-${randomUUID().slice(0, 6)}`, name: 'Delivery probe' })
        .returning({ id: objects.id })

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
        throw new Error('expected one delivery object and one delivery ticket')
      }

      ticketId = ticket.id

      // One failed delivery of the ntfy channel — the message never arrived.
      await db.insert(outbox).values({
        ticketId: ticket.id,
        channel: 'ntfy',
        eventType: 'ticket.created',
        state: 'FAILED',
        attempts: 3,
        target: { ticketNo: ticket.ticketNo, lastError: 'http_error' },
        createdAt: new Date('2026-11-18T09:00:00.000Z'),
        updatedAt: new Date('2026-11-18T09:00:05.000Z'),
      })

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'delivery@example.de', password: 'a-login-password-1234' },
      })
      const pair = cookiePair(login, 'session')

      if (pair === undefined) {
        throw new Error('login did not set a session cookie')
      }

      sessionCookie = pair
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

    const readProblems = async () => {
      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/notifications/delivery',
        headers: { cookie: sessionCookie },
      })

      expect(response.statusCode).toBe(200)

      return response.json<{
        problems: Array<{
          channel: string
          failed: number
          unacknowledged: number
          lastFailureAt: string | null
          lastError: string | null
          acknowledgedAt: string | null
          acknowledgedBy: string | null
          open: boolean
        }>
        failures: Array<{
          id: string
          channel: string
          eventType: string
          failedAt: string
          attempts: number
          error: string | null
          ticketNo: string | null
        }>
      }>()
    }

    it('names the failed delivery and the message that never arrived', async () => {
      const answer = await readProblems()
      const problem = answer.problems.find((entry) => entry.channel === 'ntfy')

      expect(problem).toMatchObject({
        failed: 1,
        unacknowledged: 1,
        lastError: 'http_error',
        acknowledgedAt: null,
        open: true,
      })
      expect(problem?.lastFailureAt).toBe('2026-11-18T09:00:05.000Z')

      expect(answer.failures).toHaveLength(1)
      expect(answer.failures[0]).toMatchObject({
        channel: 'ntfy',
        eventType: 'ticket.created',
        attempts: 3,
        error: 'http_error',
      })
      expect(answer.failures[0]?.failedAt).toBe('2026-11-18T09:00:05.000Z')
      expect(answer.failures[0]?.ticketNo).toMatch(/^ST-/)
    })

    it('acknowledges the problem and keeps the acknowledgement of the other channels', async () => {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/notifications/delivery/acknowledge',
        headers: { cookie: sessionCookie },
        payload: { channels: ['ntfy'] },
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<{ acknowledgedAt: string; channels: string[] }>()

      expect(body.channels).toEqual(['ntfy'])

      const answer = await readProblems()
      const problem = answer.problems.find((entry) => entry.channel === 'ntfy')

      expect(problem?.open).toBe(false)
      expect(problem?.unacknowledged).toBe(0)
      expect(problem?.failed).toBe(1)
      expect(problem?.acknowledgedAt).toBe(body.acknowledgedAt)
      expect(problem?.acknowledgedBy).toBe('Delivery, Ada')
    })

    it('opens the problem again when a delivery fails after the acknowledgement', async () => {
      const rows = await db
        .select({ id: outbox.id })
        .from(outbox)
        .where(eq(outbox.ticketId, ticketId))

      expect(rows).toHaveLength(1)

      await db.insert(outbox).values({
        ticketId: ticketId,
        channel: 'ntfy',
        eventType: 'ticket.assigned',
        state: 'FAILED',
        attempts: 3,
        target: { ticketNo: 'ST-0002', lastError: 'http_timeout' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const answer = await readProblems()
      const problem = answer.problems.find((entry) => entry.channel === 'ntfy')

      expect(problem).toMatchObject({
        failed: 2,
        unacknowledged: 1,
        lastError: 'http_timeout',
        open: true,
      })
      expect(answer.failures).toHaveLength(2)
    })

    it('refuses the acknowledgement without the permission', async () => {
      const [deniedUser] = await db
        .insert(users)
        .values({
          email: 'delivery-denied@example.de',
          passwordHash: await hashPassword('a-login-password-1234'),
        })
        .returning({ id: users.id })

      const [officeRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'office'))

      const [writePermission] = await db
        .select({ id: schema.permissions.id })
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'notification.write'))

      if (deniedUser === undefined || officeRole === undefined || writePermission === undefined) {
        throw new Error('expected the office role and the notification.write permission')
      }

      await db.insert(userRoles).values({ userId: deniedUser.id, roleId: officeRole.id })
      await db.insert(schema.userPermissions).values({
        userId: deniedUser.id,
        permissionId: writePermission.id,
        effect: 'deny',
      })

      const login = await app!.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'delivery-denied@example.de', password: 'a-login-password-1234' },
      })
      const pair = cookiePair(login, 'session')

      if (pair === undefined) {
        throw new Error('login did not set a session cookie')
      }

      const refused = await app!.inject({
        method: 'POST',
        url: '/api/v1/notifications/delivery/acknowledge',
        headers: { cookie: pair },
        payload: { channels: ['ntfy'] },
      })

      expect(refused.statusCode).toBe(403)

      // The right to read the problems stays: only the quittature is refused.
      const allowed = await app!.inject({
        method: 'GET',
        url: '/api/v1/notifications/delivery',
        headers: { cookie: pair },
      })

      expect(allowed.statusCode).toBe(200)

      const anonymous = await app!.inject({
        method: 'POST',
        url: '/api/v1/notifications/delivery/acknowledge',
        payload: {},
      })

      expect(anonymous.statusCode).toBe(401)
    })
  },
)
