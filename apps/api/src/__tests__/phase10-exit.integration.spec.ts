import { createHmac } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApiKey } from '../auth/api-keys'
import { createSession } from '../auth/session'
import { migrationsFolder, openTestDatabase } from '../db/__tests__/helpers/testDatabase'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { seedRbac } from '../db/seed-rbac'
import { buildServer } from '../index'
import { collectPendingWebhooks, processWebhookDeliveries } from '../webhooks/delivery'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase 10 exit criterion: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, ticketEvents, users, userRoles } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase 10 exit criterion — external API, webhooks, CSV import, privacy (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let sessionCookie = ''
    let authorization = ''
    let objectNo = ''
    let ticketNo = ''
    let webhookSecret = ''

    const captured: Array<{
      url: string
      headers: Record<string, string>
      body: string
    }> = []

    const captureFetch = vi.fn<typeof fetch>(async (input, init) => {
      captured.push({
        url: String(input),
        headers: Object.fromEntries(
          Object.entries((init?.headers as Record<string, string> | undefined) ?? {}),
        ),
        body: String(init?.body ?? ''),
      })

      return new Response('{}', { status: 200 })
    })

    async function adminIdFor(email: string): Promise<string> {
      return onlyRow(
        await db.insert(users).values({ email, passwordHash: 'no-login' }).returning({ id: users.id }),
        email,
      ).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
        key,
      ).id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await adminIdFor('phase-10-exit@example.org')
      const adminRole = await roleIdFor('admin')
      await db.insert(userRoles).values({ userId: adminId, roleId: adminRole })

      const session = await createSession(db, adminId, 1)
      sessionCookie = `session=${session.token}`

      const key = await createApiKey(
        db,
        {
          name: 'phase-10-exit',
          scopes: ['objects:read', 'objects:write', 'tickets:read', 'tickets:write'],
        },
        adminId,
      )
      authorization = `Bearer ${key.token}`

      const webhook = await appInject(
        'POST',
        '/api/v1/webhooks',
        { url: 'http://127.0.0.1:1/hook', events: ['ticket.created', 'ticket.status_changed'] },
      )
      expect(webhook.statusCode).toBe(201)
      webhookSecret = webhook.json<{ secret: string }>().secret

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

    function appInject(
      method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      path: string,
      payload?: unknown,
      headers: Record<string, string> = {},
    ) {
      return app.inject({
        method,
        url: path,
        headers: { cookie: sessionCookie, ...headers },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    function bearer(
      method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      path: string,
      payload?: unknown,
    ) {
      return app.inject({
        method,
        url: path,
        headers: { authorization },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    it('mints an API key whose scopes gate the external object and ticket routes', async () => {
      const list = await appInject('GET', '/api/v1/api-keys')
      expect(list.statusCode).toBe(200)
      expect(list.json<{ keys: Array<{ id: string, scopes: string[] }> }>().keys).toHaveLength(1)
    })

    it('creates an object through the external object API (PUT)', async () => {
      const response = await bearer('PUT', '/api/v1/objects/EXT-101', { name: 'Pump house' })

      expect(response.statusCode).toBe(201)
      const body = response.json<{ objectNo: string; name: string; qrToken: string | null }>()

      expect(body.objectNo).toBe('EXT-101')
      expect(body.name).toBe('Pump house')
      expect(body.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/)

      objectNo = body.objectNo

      const stored = await db
        .select({ objectNo: objects.objectNo, qrToken: objects.qrToken })
        .from(objects)
        .where(eq(objects.objectNo, 'EXT-101'))

      expect(stored).toHaveLength(1)
      expect(stored[0]!.qrToken).toBe(body.qrToken)
    })

    it('reads the object through the external object API (GET)', async () => {
      const response = await bearer('GET', `/api/v1/objects/${objectNo}`)

      expect(response.statusCode).toBe(200)
      expect(response.json<{ objectNo: string }>().objectNo).toBe(objectNo)
    })

    it('creates a ticket through the external ticket API (POST)', async () => {
      const response = await bearer('POST', '/api/v1/tickets', {
        objectNo,
        title: 'External fault',
        description: 'From the control system',
        priority: 'high',
        contact: { name: 'Reporter One', phone: '01700000001', email: 'reporter@example.de' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json<{ ticketNo: string; status: string; source?: string }>()

      expect(body.ticketNo).toMatch(/^ST-\d{4}-\d{4}$/)
      expect(body.status).toBe('NEW')

      ticketNo = body.ticketNo

      const stored = await db
        .select({ ticketNo: tickets.ticketNo, source: tickets.source, reporterName: tickets.reporterName })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      expect(stored).toHaveLength(1)
      expect(stored[0]!.source).toBe('API')
      expect(stored[0]!.reporterName).toBe('Reporter One')
    })

    it('sets the work order through the external ticket API (PATCH)', async () => {
      const response = await bearer('PATCH', `/api/v1/tickets/${ticketNo}/work-order`, {
        type: 'AA',
        number: '12345',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<{ status: string }>().status).toBe('WORK_ORDER_CREATED')

      const stored = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      expect(stored[0]!.status).toBe('WORK_ORDER_CREATED')
    })

    it('delivers the signed ticket.created and ticket.status_changed webhooks', async () => {
      const queued = await collectPendingWebhooks(db)

      expect(queued).toBe(2)

      const result = await processWebhookDeliveries(db, new Date(), undefined, captureFetch)

      expect(result.sent).toBe(2)
      expect(result.failed).toBe(0)
      expect(captured).toHaveLength(2)

      const events = captured.map((call) => call.headers['x-stoerdesk-event']).sort()

      expect(events).toEqual(['ticket.created', 'ticket.status_changed'])

      for (const call of captured) {
        const header = call.headers['x-stoerdesk-signature'] as string

        expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)

        const [tPart, v1Part] = header.split(',')
        const timestamp = tPart.slice(2)
        const expected = createHmac('sha256', webhookSecret)
          .update(`${timestamp}.${call.body}`)
          .digest('hex')

        expect(v1Part.slice(3)).toBe(expected)

        const payload = JSON.parse(call.body)

        expect(payload.event).toBe(call.headers['x-stoerdesk-event'])
        expect(payload.ticket.ticketNo).toBe(ticketNo)
        expect(call.headers['content-type']).toBe('application/json')
      }

      // The secret is stored once and never leaves again.
      const listed = await appInject('GET', '/api/v1/webhooks')
      const listedSecrets = JSON.stringify(listed.json<{ webhooks: Array<{ secret?: string }> }>().webhooks)

      expect(listed.statusCode).toBe(200)
      expect(listedSecrets).not.toContain(webhookSecret)
    })

    it('previews and commits a CSV import under object.import (session only)', async () => {
      const csv = ['objektnummer;bezeichnung;ort', 'CSV-201;Pump house;Berlin', 'CSV-202;Depot two;Cologne'].join('\r\n')

      const preview = await appInject('POST', '/api/v1/objects/import/preview', { csv })

      expect(preview.statusCode).toBe(200)
      expect(preview.json<{ summary: Record<string, number> }>().summary).toEqual({
        new: 2,
        changed: 0,
        unchanged: 0,
        error: 0,
      })

      const commit = await appInject('POST', '/api/v1/objects/import', { csv })

      expect(commit.statusCode).toBe(200)
      expect(commit.json<{ applied: Record<string, number> }>().applied).toEqual({
        created: 2,
        updated: 0,
        unchanged: 0,
        failed: 0,
      })

      const stored = await db
        .select({ objectNo: objects.objectNo, name: objects.name })
        .from(objects)
        .where(eq(objects.objectNo, 'CSV-202'))

      expect(stored).toHaveLength(1)
      expect(stored[0]!.name).toBe('Depot two')
    })

    it('erases the reporter contact data of a ticket (user.write, session only)', async () => {
      const erase = await appInject(
        'POST',
        `/api/v1/privacy/tickets/${ticketNo}/erase`,
        { reason: 'GDPR request of the data subject' },
      )

      expect(erase.statusCode).toBe(200)
      expect(erase.json<{ alreadyErased: boolean }>().alreadyErased).toBe(false)

      const stored = await db
        .select({
          reporterName: tickets.reporterName,
          reporterPhone: tickets.reporterPhone,
          reporterEmail: tickets.reporterEmail,
        })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))

      expect(stored).toHaveLength(1)
      expect(stored[0]!.reporterName).toBeNull()
      expect(stored[0]!.reporterPhone).toBeNull()
      expect(stored[0]!.reporterEmail).toBeNull()

      const erasures = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.type, 'personal_data_erased'))

      expect(erasures).toHaveLength(1)
      expect((erasures[0]!.payload as { reasonLength: number }).reasonLength).toBe(
        'GDPR request of the data subject'.length,
      )

      // Idempotent: a repeat writes no second event.
      const again = await appInject(
        'POST',
        `/api/v1/privacy/tickets/${ticketNo}/erase`,
        { reason: 'the same subject request again' },
      )

      expect(again.statusCode).toBe(200)
      expect(again.json<{ alreadyErased: boolean }>().alreadyErased).toBe(true)

      const allErasures = await db
        .select({ id: ticketEvents.id })
        .from(ticketEvents)
        .where(eq(ticketEvents.type, 'personal_data_erased'))

      expect(allErasures).toHaveLength(1)
    })
  },
)
