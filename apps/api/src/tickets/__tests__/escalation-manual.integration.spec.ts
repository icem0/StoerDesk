import { asc, eq } from 'drizzle-orm'
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
  process.stderr.write(`skipped manual escalation routes: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets, users, userRoles, roles } = schema

function cookiePair(response: { headers: IncomingHttpHeaders | OutgoingHttpHeaders }) {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']
  const entries = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : []

  for (const entry of entries) {
    const [pair] = entry.split(';')

    if (pair !== undefined && pair.startsWith('session=')) {
      return pair
    }
  }

  return undefined
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'manual escalation route (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let cookie = ''
    let ticketNo = ''
    const now = new Date('2026-11-05T09:00:00.000Z')

    async function events() {
      const [ticket] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.ticketNo, ticketNo))
        .limit(1)

      return await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticket?.id ?? ''))
        .orderBy(asc(ticketEvents.createdAt))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const user = onlyRow(
        await db
          .insert(users)
          .values({
            email: 'escalate@example.de',
            passwordHash: await hashPassword('a-login-password-1234'),
          })
          .returning({ id: users.id }),
        'actor',
      )
      const adminRole = onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin')),
        'admin role',
      )
      await db.insert(userRoles).values({ userId: user.id, roleId: adminRole.id })

      const object = onlyRow(
        await db
          .insert(objects)
          .values({ objectNo: '8101_01', name: 'Eskalationsprobe' })
          .returning({ id: objects.id }),
        'object',
      )
      ticketNo = onlyRow(
        await db
          .insert(tickets)
          .values({
            objectId: object.id,
            status: 'ACCEPTED',
            priority: 'normal',
            source: 'INTERNAL',
            reportedAt: now,
            receivedAt: now,
            deadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
          })
          .returning({ ticketNo: tickets.ticketNo }),
        'ticket',
      ).ticketNo

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'
      app = await buildServer()

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'escalate@example.de', password: 'a-login-password-1234' },
      })
      cookie = cookiePair(login) ?? ''

      if (cookie === '') {
        throw new Error('login did not set a session cookie')
      }
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function escalate(payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/escalate`,
        headers: { cookie },
        payload,
      })
    }

    it('writes an escalation_set event with the stage snapshot', async () => {
      const response = await escalate({ stageKey: 'office', text: 'Bitte übernehmen' })

      expect(response.statusCode).toBe(200)

      const written = (await events()).at(-1)
      expect(written?.type).toBe('escalation_set')
      expect(written?.payload).toMatchObject({ stageKey: 'office', text: 'Bitte übernehmen' })
    })

    it('writes a comment event when no stage is selected', async () => {
      const response = await escalate({ stageKey: null, text: 'Nur eine Notiz' })

      expect(response.statusCode).toBe(200)
      expect((await events()).at(-1)?.type).toBe('comment')
    })

    it('moves backwards to an earlier stage', async () => {
      expect((await escalate({ stageKey: 'manager', text: 'Weiter' })).statusCode).toBe(200)
      expect((await escalate({ stageKey: 'office', text: 'Zurück' })).statusCode).toBe(200)

      const stages = (await events())
        .filter((event) => event.type === 'escalation_set')
        .map((event) => (event.payload as { stageKey: string }).stageKey)

      expect(stages.slice(-2)).toEqual(['manager', 'office'])
    })

    it('rejects an unknown stage key', async () => {
      const response = await escalate({ stageKey: 'does_not_exist', text: 'Unbekannt' })

      expect(response.statusCode).toBe(400)
      expect(response.json<{ code: string }>().code).toBe('invalid_request')
    })
  },
)
