import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateTicketEscalations } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation actions integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, ticketEvents, outbox, webhookEndpoints, webhookDeliveries } = schema
const MINUTE = 60 * 1000

describe.skipIf(testDatabase.status === 'unavailable')(
  'the actions of a fired rule (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let objectId = ''
    let endpointId = ''
    const now = new Date('2026-11-05T12:00:00.000Z')

    async function createTicket(priority = 'normal') {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority,
          reportedAt: new Date(now.getTime() - 30 * MINUTE),
          receivedAt: new Date(now.getTime() - 30 * MINUTE),
          deadlineAt: new Date(now.getTime() + 42 * 60 * MINUTE),
        })
        .returning({ id: tickets.id })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      return ticket
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `ACT-${randomUUID().slice(0, 6)}`, name: 'Action probe' })
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
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('runs the three actions of a rule', async () => {
      await db.insert(schema.escalationActions).values([
        {
          key: 'office_ntfy',
          ruleKey: 'review',
          type: 'notify',
          config: { channels: ['ntfy'] },
          condition: { all: [] },
          position: 0,
          active: true,
        },
        {
          key: 'office_webhook',
          ruleKey: 'review',
          type: 'webhook',
          config: { endpointIds: [endpointId] },
          condition: { all: [] },
          position: 1,
          active: true,
        },
        {
          key: 'office_note',
          ruleKey: 'review',
          type: 'history',
          config: { text: 'Das Büro wurde informiert.' },
          condition: { all: [] },
          position: 2,
          active: true,
        },
      ])

      const ticket = await createTicket('critical')

      const fired = await evaluateTicketEscalations(db, ticket.id, now)

      expect(fired.map((entry) => entry.rule)).toContain('review')

      const outboxRows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(outboxRows).toHaveLength(1)
      expect(outboxRows[0]?.channel).toBe('ntfy')

      const deliveries = await db.select().from(webhookDeliveries)

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0]?.eventType).toBe('ticket.escalated')
      expect(deliveries[0]?.endpointId).toBe(endpointId)

      const notes = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticket.id))

      const note = notes.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        rule: 'review',
        stage: 'review',
        text: 'Das Büro wurde informiert.',
      })
    })

    it('skips an action whose condition does not match', async () => {
      await db
        .update(schema.escalationActions)
        .set({ condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] } })
        .where(eq(schema.escalationActions.key, 'office_ntfy'))

      const ticket = await createTicket('normal')

      await evaluateTicketEscalations(db, ticket.id, now)

      const outboxRows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(outboxRows).toHaveLength(0)
    })
  },
)
