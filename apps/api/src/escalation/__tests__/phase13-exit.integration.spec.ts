import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { evaluateTicketEscalations } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase13 exit integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, objects, tickets, ticketEvents, outbox, webhookEndpoints } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const MINUTE = 60 * 1000
const NOW = new Date('2026-11-05T12:00:00.000Z')

describe.skipIf(testDatabase.status === 'unavailable')(
  'the exit criterion of the escalation phase (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let objectId = ''
    let endpointId = ''
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    async function createTicket(priority = 'normal') {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority,
          reportedAt: new Date(NOW.getTime() - 30 * MINUTE),
          receivedAt: new Date(NOW.getTime() - 30 * MINUTE),
          deadlineAt: new Date(NOW.getTime() + 50 * MINUTE),
        })
        .returning({ id: tickets.id })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      return ticket.id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      const [endpoint] = await db
        .insert(webhookEndpoints)
        .values({
          url: 'https://hook.e2e.invalid/escalation',
          secret: `whsec_${'a'.repeat(43)}`,
          events: ['ticket.created'],
          active: true,
        })
        .returning({ id: webhookEndpoints.id })

      endpointId = endpoint?.id ?? ''

      const adminId = await userIdFor('admin-phase13@example.org')
      const officeId = await userIdFor('office-phase13@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)

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

    it('fires the rule of a stage once and runs its three actions', async () => {
      await db.insert(schema.escalationActions).values([
        {
          key: 'exit_notify',
          ruleKey: 'review',
          type: 'notify',
          config: { channels: ['ntfy'] },
          condition: { all: [] },
          position: 0,
          active: true,
        },
        {
          key: 'exit_webhook',
          ruleKey: 'review',
          type: 'webhook',
          config: { endpointIds: [endpointId] },
          condition: { all: [] },
          position: 1,
          active: true,
        },
        {
          key: 'exit_note',
          ruleKey: 'review',
          type: 'history',
          config: { text: 'Die Stufen check ran.' },
          condition: { all: [] },
          position: 2,
          active: true,
        },
      ])

      const ticketId = await createTicket('critical')

      const fired = await evaluateTicketEscalations(db, ticketId, NOW)

      expect(fired.filter((entry) => entry.rule === 'review')).toHaveLength(1)

      const outboxRows = await db.select().from(outbox).where(eq(outbox.ticketId, ticketId))

      expect(outboxRows).toHaveLength(1)
      expect(outboxRows[0]?.channel).toBe('ntfy')

      const deliveries = await db.select({ id: schema.webhookDeliveries.id }).from(schema.webhookDeliveries)

      expect(deliveries).toHaveLength(1)

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId))

      expect(events.filter((event) => event.type === 'escalated')).toHaveLength(1)
      expect(events.some((event) => event.type === 'escalation_note')).toBe(true)

      const again = await evaluateTicketEscalations(db, ticketId, NOW)

      expect(again).toHaveLength(0)
      const eventsAgain = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

      expect(eventsAgain.filter((event) => event.type === 'escalated')).toHaveLength(1)
    })

    it('keeps a rule silent when its condition does not match', async () => {
      await db
        .update(schema.escalationRules)
        .set({
          condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] },
        })
        .where(eq(schema.escalationRules.key, 'review'))

      const ticketId = await createTicket('normal')

      const fired = await evaluateTicketEscalations(db, ticketId, NOW)

      expect(fired).toHaveLength(0)

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId))

      expect(events.filter((event) => event.type === 'escalated')).toHaveLength(0)
    })

    it('fires the deadline rules at 80 percent and at the deadline', async () => {
      const ticketId = await createTicket('normal')
      const [row] = await db.select({ deadlineAt: tickets.deadlineAt }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)

      const deadlineAt = row?.deadlineAt ?? NOW

      const late = new Date(new Date(deadlineAt).getTime() + 10 * MINUTE)

      const fired = await evaluateTicketEscalations(db, ticketId, late)

      expect(fired.map((entry) => entry.rule)).toEqual(
        expect.arrayContaining(['deadline_80_percent', 'deadline_exceeded']),
      )
    })

    it('the old routes of the manual escalation are gone', async () => {
      const escalate = await app.inject({
        method: 'POST',
        url: '/api/v1/tickets/ST-2026-0001/escalate',
        headers: { cookie: cookies['office'] },
        payload: { stageKey: 'group', text: 'Dies should never write an event' },
      })

      expect(escalate.statusCode).toBe(404)

      const catalog = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/escalation-stages',
        headers: { cookie: cookies['admin'] },
      })

      expect(catalog.statusCode).toBe(404)
    })
  },
)
