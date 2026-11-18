import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

/**
 * A ticket number of the yearly counter (`specs/02-data-model.md` §4.11,
 * ADR-0027 decision 4 and 5): the number of an existing ticket is never
 * rewritten, so the API has to answer it — a bookmark, a printed link and the
 * outbox of a client carry it. The new numbers are `ST-0001` without a year
 * (WP-M14-129a), the old ones keep their `ST-<year>-<counter>` shape.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped legacy ticket number integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, objects, tickets } = schema

const LEGACY_TICKET_NO = 'ST-2026-0001'
const STATUS_TOKEN = 'legacyStatusToken00001'

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows
  if (!row) {
    throw new Error(`expected one ${what}`)
  }
  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'a ticket number of the yearly counter still resolves through the API (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let officeCookie = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })
      return onlyRow(inserted, `user ${email}`).id
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

      const officeId = await userIdFor('office-legacy-ticket-no@example.org')
      await db.insert(userRoles).values([
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      const session = await createSession(db, officeId, 1)
      officeCookie = `session=${session.token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const object = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: 'OBJ-LEGACY-NO-1',
            name: 'Testobjekt alte Nummer',
            qrToken: 'qr-legacy-ticket-no-1',
          })
          .returning({ id: objects.id }),
        'object',
      )

      await db.insert(tickets).values({
        objectId: object.id,
        ticketNo: LEGACY_TICKET_NO,
        status: 'NEW',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date(),
        receivedAt: new Date(),
        deadlineAt: new Date(),
        statusToken: STATUS_TOKEN,
      })
    })

    afterAll(async () => {
      await db.delete(tickets)
      await db.delete(objects)
      await app.close()
      await client.end({ timeout: 2 })
      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers the detail of the ticket', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/tickets/${LEGACY_TICKET_NO}`,
        headers: { cookie: officeCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<{ ticket: { ticketNo: string } }>().ticket.ticketNo).toBe(
        LEGACY_TICKET_NO,
      )
    })

    it('takes the comment of the internal user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${LEGACY_TICKET_NO}/comments`,
        headers: { cookie: officeCookie },
        payload: {
          clientUuid: '11111111-1111-4111-8111-111111111111',
          text: 'Nachricht zu einem Ticket mit alter Nummer',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json<{ ticketNo: string }>().ticketNo).toBe(LEGACY_TICKET_NO)
    })

    it('moves the ticket through the workflow', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${LEGACY_TICKET_NO}/review`,
        headers: { cookie: officeCookie },
      })

      expect(response.statusCode).toBe(200)

      const [stored] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.ticketNo, LEGACY_TICKET_NO))
        .limit(1)

      expect(stored?.status).toBe('IN_REVIEW')
    })

    it('answers the public status page of the ticket', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/public/tickets/${STATUS_TOKEN}/status`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<{ ticketNo: string }>().ticketNo).toBe(LEGACY_TICKET_NO)
    })
  },
)
