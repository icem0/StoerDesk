import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { generateQrToken } from '../../objects/qr'
import { createInternalTicket } from '../internal'

/**
 * The priority of a new ticket (ADR-0029, `specs/06-report-form.md` §7.2,
 * WP-M14-134e): the internal report keeps the explicit choice of the user, a
 * request without a priority takes the deviation of the object, and the QR
 * report always takes the deviation of its object.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped object priority integration: ${testDatabase.reason}\n`)
}

const HOUR = 60 * 60 * 1000

const { objectPriorityOverrides, objects, tickets, users } = schema

function onlyRow<T>(rows: (T | undefined)[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the priority of a new ticket (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let actorUserId = ''
    let objectId = ''
    let qrToken = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [actor] = await db
        .insert(users)
        .values({
          email: `priority-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: users.id })
      actorUserId = actor?.id ?? ''

      const [object] = await db
        .insert(objects)
        .values({
          objectNo: `PRIO-${randomUUID().slice(0, 6)}`,
          name: 'Klinik Nord',
          qrToken: generateQrToken(),
        })
        .returning({ id: objects.id, qrToken: objects.qrToken })
      objectId = object?.id ?? ''
      qrToken = object?.qrToken ?? ''

      await db
        .insert(objectPriorityOverrides)
        .values({ objectId, priority: 'critical' })

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

    it('gives an internal ticket without a priority the deviation of the object', async () => {
      const created = await createInternalTicket(
        db,
        {
          objectId,
          title: undefined,
          description: undefined,
          faultTemplateKeys: [],
        },
        actorUserId,
      )

      const [row] = await db.select().from(tickets).where(eq(tickets.id, created.ticketId))

      expect(row?.priority).toBe('critical')
      expect(row?.deadlineAt.getTime()).toBe((row?.reportedAt.getTime() ?? 0) + 8 * HOUR)
    })

    it('keeps the explicit priority of the internal user', async () => {
      const created = await createInternalTicket(
        db,
        {
          objectId,
          title: undefined,
          description: undefined,
          priority: 'low',
          faultTemplateKeys: [],
        },
        actorUserId,
      )

      const [row] = await db.select().from(tickets).where(eq(tickets.id, created.ticketId))

      expect(row?.priority).toBe('low')
      expect(row?.deadlineAt.getTime()).toBe((row?.reportedAt.getTime() ?? 0) + 168 * HOUR)
    })

    it('gives a QR report the deviation of its object', async () => {
      const clientUuid = randomUUID()

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/public/tickets',
        payload: {
          qrToken,
          clientUuid,
          text: 'Die RWA springt nicht an.',
          contact: { phone: '+49 170 1234567' },
          locale: 'de',
        },
        remoteAddress: '10.98.0.1',
      })

      expect(response.statusCode).toBe(201)

      const [row] = await db.select().from(tickets).where(eq(tickets.clientUuid, clientUuid))

      expect(row?.priority).toBe('critical')
      expect(row?.source).toBe('QR')
      expect(row?.deadlineAt.getTime()).toBe((row?.reportedAt.getTime() ?? 0) + 8 * HOUR)
    })

    it('gives a QR report of an object without a deviation the standard', async () => {
      const plain = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: `PLAIN-${randomUUID().slice(0, 6)}`,
            name: 'Lagerhalle',
            qrToken: generateQrToken(),
          })
          .returning({ id: objects.id, qrToken: objects.qrToken }),
        'object',
      )
      const clientUuid = randomUUID()

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/public/tickets',
        payload: {
          qrToken: plain.qrToken,
          clientUuid,
          text: 'Die Tür klemmt.',
          contact: { phone: '+49 170 1234568' },
          locale: 'de',
        },
        remoteAddress: '10.98.0.2',
      })

      expect(response.statusCode).toBe(201)

      const [row] = await db.select().from(tickets).where(eq(tickets.clientUuid, clientUuid))

      expect(row?.priority).toBe('normal')
      expect(row?.deadlineAt.getTime()).toBe((row?.reportedAt.getTime() ?? 0) + 72 * HOUR)
    })
  },
)
