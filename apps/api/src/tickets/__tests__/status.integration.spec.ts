import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { generateQrToken } from '../../objects/qr'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped status integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets } = schema

type StatusBody = {
  ticketNo?: string
  status?: string
  reportedAt?: string
  deadlineAt?: string
  events?: { type?: string; at?: string }[]
}
type ErrorBody = { code?: string; params?: Record<string, unknown> }

const uploadDir = await mkdtemp(join(tmpdir(), 'stoerdesk-status-test-'))

function onlyRow<T>(rows: (T | undefined)[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'public ticket status endpoint (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let objectId: string

    async function createTicket(
      statusToken: string,
      status = 'NEW',
      events: { type: string; createdAt: Date; payload?: Record<string, unknown> }[] = [],
    ) {
      const reportedAt = new Date('2026-10-31T09:00:00.000Z')
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status,
          priority: 'normal',
          source: 'QR',
          description: 'Interner Text, der nicht öffentlich ist',
          reporterPhone: '+49 170 1234567',
          reportedAt,
          receivedAt: reportedAt,
          deadlineAt: new Date(reportedAt.getTime() + 72 * 60 * 60 * 1000),
          statusToken,
        })
        .returning()

      const stored = onlyRow([ticket], 'ticket')

      if (events.length > 0) {
        await db.insert(ticketEvents).values(
          events.map((event) => ({
            ticketId: stored.id,
            type: event.type,
            actorKind: 'system',
            payload: event.payload ?? {},
            createdAt: event.createdAt,
          })),
        )
      }

      return stored
    }

    const statusOf = (token: string) =>
      app.inject({ method: 'GET', url: `/api/v1/public/tickets/${token}/status` })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.UPLOAD_DIR = uploadDir
      process.env.UPLOAD_MAX_BYTES = '2048'

      app = await buildServer()

      const [object] = await db
        .insert(objects)
        .values({ objectNo: '7201_01', name: 'Rathaus', city: 'Musterstadt' })
        .returning({ id: objects.id })

      objectId = onlyRow([object], 'object').id
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })
      await rm(uploadDir, { recursive: true, force: true })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers the ticket number, status and the public timeline in order', async () => {
      const token = generateQrToken()
      const ticket = await createTicket(token, 'ACCEPTED', [
        { type: 'created', createdAt: new Date('2026-10-31T09:00:00.000Z') },
        { type: 'comment', createdAt: new Date('2026-10-31T09:05:00.000Z') },
        { type: 'work_order_set', createdAt: new Date('2026-10-31T09:10:00.000Z') },
        { type: 'accepted', createdAt: new Date('2026-10-31T09:20:00.000Z') },
      ])

      const response = await statusOf(token)
      const body = response.json<StatusBody>()

      expect(response.statusCode).toBe(200)
      expect(body.ticketNo).toBe(ticket.ticketNo)
      expect(body.status).toBe('ACCEPTED')
      expect(body.reportedAt).toBe('2026-10-31T09:00:00.000Z')
      expect(body.deadlineAt).toBe('2026-11-03T09:00:00.000Z')
      expect(body.events?.map((event) => event.type)).toEqual([
        'created',
        'work_order_set',
        'accepted',
      ])
      expect(body.events?.every((event) => typeof event.at === 'string')).toBe(true)
    })

    it('answers 404 for an unknown and for a malformed token', async () => {
      for (const token of [generateQrToken(), 'short', 'not-a-token-at-all']) {
        const response = await statusOf(token)

        expect(response.statusCode).toBe(404)
        expect(response.json<ErrorBody>().code).toBe('status_token_not_found')
      }
    })

    it('keeps internal events, actors and payloads out of the response', async () => {
      const token = generateQrToken()

      await createTicket(token, 'NEW', [
        {
          type: 'created',
          createdAt: new Date('2026-10-31T09:00:00.000Z'),
          payload: { locale: 'de', textLength: 12 },
        },
        {
          type: 'declined',
          createdAt: new Date('2026-10-31T09:10:00.000Z'),
          payload: { reason: 'Interner Grund mit Name' },
        },
      ])

      const response = await statusOf(token)
      const body = response.json<StatusBody>()
      const serialized = JSON.stringify(body)

      expect(response.statusCode).toBe(200)
      expect(body.events).toHaveLength(1)
      expect(body.events?.[0]).toEqual({ type: 'created', at: '2026-10-31T09:00:00.000Z' })
      expect(serialized).not.toContain('Interner Grund')
      expect(serialized).not.toContain('reporterPhone')
      expect(serialized).not.toContain('Interner Text')
    })
  },
)
