import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiKey } from '../../auth/api-keys'
import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped external ticket integration: ${testDatabase.reason}\n`)
}

const { objects, roles, ticketEvents, tickets, userRoles, users } = schema

type CreatedBody = { ticketNo: string; status: string }
type ListBody = { tickets: Array<{ ticketNo: string }> }
type ErrorBody = { code?: string }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'external ticket API — create, list and work order (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let authorization: string
    let apiKeyId: string
    let sessionCookie: string
    let ticketNo: string

    function call(
      method: 'GET' | 'POST' | 'PATCH',
      path: string,
      payload?: unknown,
      headers: Record<string, string> = { authorization },
    ) {
      return app.inject({
        method,
        url: path,
        headers,
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const admin = onlyRow(
        await db
          .insert(users)
          .values({ email: 'external-tickets@example.org', passwordHash: 'no-login' })
          .returning({ id: users.id }),
        'admin user',
      )
      const adminRole = onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin')),
        'admin role',
      )
      await db.insert(userRoles).values({ userId: admin.id, roleId: adminRole.id })

      const session = await createSession(db, admin.id, 1)
      sessionCookie = `session=${session.token}`

      await db.insert(objects).values({ objectNo: 'EXT-TICKET-1', name: 'External object' })

      const key = await createApiKey(
        db,
        { name: 'external-tickets', scopes: ['tickets:read', 'tickets:write'] },
        admin.id,
      )
      authorization = `Bearer ${key.token}`
      apiKeyId = key.key.id

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
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

    it('creates with source API and a system created event', async () => {
      const response = await call('POST', '/api/v1/tickets', {
        objectNo: 'ext-ticket-1',
        title: 'External fault',
        description: 'From the control system',
        priority: 'high',
      })

      expect(response.statusCode).toBe(201)

      const body = response.json<CreatedBody>()
      ticketNo = body.ticketNo
      expect(body.status).toBe('NEW')

      const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketNo, ticketNo))
      expect(ticket?.source).toBe('API')

      const [event] = await db
        .select()
        .from(ticketEvents)
        .where(and(eq(ticketEvents.ticketId, ticket!.id), eq(ticketEvents.type, 'created')))

      expect(event?.actorKind).toBe('system')
      expect(event?.actorUserId).toBeNull()
      expect((event?.payload as { apiKeyId?: string }).apiKeyId).toBe(apiKeyId)
    })

    it('lists the ticket with updated_since for the key', async () => {
      const response = await call(
        'GET',
        '/api/v1/tickets?updated_since=2020-01-01T00:00:00.000Z&objectNo=EXT-TICKET-1',
      )

      expect(response.statusCode).toBe(200)
      expect(response.json<ListBody>().tickets.some((row) => row.ticketNo === ticketNo)).toBe(true)
    })

    it('rejects the work-order update from NEW with 409', async () => {
      const response = await call('PATCH', `/api/v1/tickets/${ticketNo}/work-order`, {
        text: 'Electric WO-1',
      })

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorBody>().code).toBe('invalid_transition')
    })

    it('sets the work order as a system actor from IN_REVIEW', async () => {
      await db.update(tickets).set({ status: 'IN_REVIEW' }).where(eq(tickets.ticketNo, ticketNo))

      const response = await call('PATCH', `/api/v1/tickets/${ticketNo}/work-order`, {
        text: 'Electric WO-1',
      })

      expect(response.statusCode).toBe(200)

      const [row] = await db.select().from(tickets).where(eq(tickets.ticketNo, ticketNo))
      const [event] = await db
        .select()
        .from(ticketEvents)
        .where(and(eq(ticketEvents.ticketId, row!.id), eq(ticketEvents.type, 'work_order_set')))

      expect(event?.actorKind).toBe('system')
      expect((event?.payload as { apiKeyId?: string }).apiKeyId).toBe(apiKeyId)
    })

    it('keeps the session path for internal creation', async () => {
      const object = onlyRow(
        await db.select().from(objects).where(eq(objects.objectNo, 'EXT-TICKET-1')),
        'object',
      )
      const response = await call(
        'POST',
        '/api/v1/tickets',
        { objectId: object.id, title: 'Office ticket' },
        { cookie: sessionCookie },
      )

      expect(response.statusCode).toBe(201)
      const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketNo, response.json<CreatedBody>().ticketNo))
      expect(ticket?.source).toBe('INTERNAL')
    })

    it('answers 404 for an unknown ticket number', async () => {
      const response = await call('PATCH', '/api/v1/tickets/ST-2026-9999/work-order', {
        type: 'Electric',
        number: 'WO-2',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json<ErrorBody>().code).toBe('ticket_not_found')
    })
  },
)
