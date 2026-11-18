import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_RULES } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { messageOf } from '../../notifications/outbox'
import { evaluateTicketEscalations } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation actions integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, ticketEvents, outbox, webhookEndpoints, webhookDeliveries } = schema
const { notificationAccounts, notificationPreferences, users } = schema
const MINUTE = 60 * 1000

/** The key of the seeded rule of a stage; the numbering is the identity (§7.5). */
function seededRuleKey(stageKey: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.stageKey === stageKey)

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of the stage ${stageKey}`)
  }

  return rule.key
}

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
          ruleKey: seededRuleKey('review'),
          type: 'notify',
          config: { channels: ['ntfy'] },
          condition: { all: [] },
          position: 0,
          active: true,
        },
        {
          key: 'office_webhook',
          ruleKey: seededRuleKey('review'),
          type: 'webhook',
          config: { endpointIds: [endpointId] },
          condition: { all: [] },
          position: 1,
          active: true,
        },
        {
          key: 'office_note',
          ruleKey: seededRuleKey('review'),
          type: 'history',
          config: { text: 'Das Büro wurde informiert.' },
          condition: { all: [] },
          position: 2,
          active: true,
        },
      ])

      const ticket = await createTicket('critical')

      const fired = await evaluateTicketEscalations(db, ticket.id, now)

      expect(fired.map((entry) => entry.rule)).toContain(seededRuleKey('review'))

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

      const comment = notes.find((event) => event.type === 'comment')

      expect(comment?.actorKind).toBe('system')
      expect(comment?.payload).toEqual({ text: 'Das Büro wurde informiert.' })
      expect(notes.some((event) => event.type === 'escalation_note')).toBe(false)
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

    it('moves the status of a ticket with a status_change action', async () => {
      await db.insert(schema.escalationActions).values({
        key: 'status_to_review',
        ruleKey: seededRuleKey('review'),
        type: 'status_change',
        config: { toStatus: 'IN_REVIEW' },
        condition: { all: [] },
        position: 3,
        active: true,
      })

      const ticket = await createTicket('critical')

      const fired = await evaluateTicketEscalations(db, ticket.id, now)

      expect(fired.map((entry) => entry.rule)).toContain(seededRuleKey('review'))

      const [moved] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('IN_REVIEW')

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const step = events.find(
        (event) => event.type === 'review_started' && event.actorKind === 'system',
      )

      expect(step?.payload).toMatchObject({
        rule: seededRuleKey('review'),
        stage: 'review',
      })

      const note = events.find((event) => {
        if (event.type !== 'escalation_note') {
          return false
        }

        const payload = event.payload as Record<string, unknown>

        return payload.to === 'IN_REVIEW'
      })

      expect(note?.payload).toMatchObject({
        rule: seededRuleKey('review'),
        stage: 'review',
        from: 'NEW',
        to: 'IN_REVIEW',
      })

      const again = await evaluateTicketEscalations(db, ticket.id, now)

      expect(again).toHaveLength(0)

      const [stillInReview] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(stillInReview?.status).toBe('IN_REVIEW')
    })

    it('notifies the selected user on the own ntfy topic with the selected priority', async () => {
      const email = `notify-${randomUUID().slice(0, 8)}@example.invalid`
      const topic = `stoerdesk-${randomUUID().slice(0, 8)}`
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: 'not-a-real-hash', givenName: 'Nora', familyName: 'Notify' })
        .returning({ id: users.id })

      if (user === undefined) {
        throw new Error('user insert failed')
      }

      await db.insert(notificationAccounts).values({
        userId: user.id,
        channel: 'ntfy',
        externalId: topic,
      })
      await db.insert(notificationPreferences).values({
        userId: user.id,
        eventType: 'ticket.escalated',
        channel: 'ntfy',
      })
      await db.insert(schema.escalationActions).values({
        key: 'user_notify',
        ruleKey: seededRuleKey('review'),
        type: 'notify',
        config: { target: { kind: 'user', id: user.id }, priority: 'urgent' },
        condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] },
        position: 4,
        active: true,
      })

      const ticket = await createTicket('critical')

      await evaluateTicketEscalations(db, ticket.id, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))
      const targeted = rows.filter(
        (row) => (row.target as Record<string, unknown>).ntfyTopic === topic,
      )

      expect(targeted).toHaveLength(1)
      expect(targeted[0]?.channel).toBe('ntfy')
      expect(targeted[0]?.eventType).toBe('ticket.escalated')
      expect(targeted[0]?.target).toMatchObject({ ntfyPriority: 5, targetName: 'Nora Notify' })
      expect(messageOf((targeted[0]?.target ?? {}) as Record<string, unknown>).ntfyPriority).toBe(5)
    })

    it('notifies the technician of the ticket with the target assigned', async () => {
      const email = `assigned-${randomUUID().slice(0, 8)}@example.invalid`
      const topic = `stoerdesk-${randomUUID().slice(0, 8)}`
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: 'not-a-real-hash', givenName: 'Nils', familyName: 'Assigned' })
        .returning({ id: users.id })

      if (user === undefined) {
        throw new Error('user insert failed')
      }

      await db.insert(notificationAccounts).values({
        userId: user.id,
        channel: 'ntfy',
        externalId: topic,
      })
      await db.insert(notificationPreferences).values({
        userId: user.id,
        eventType: 'ticket.escalated',
        channel: 'ntfy',
      })

      const ticket = await createTicket('critical')

      await db.insert(schema.ticketAssignees).values({ ticketId: ticket.id, userId: user.id })

      await db.insert(schema.escalationActions).values({
        key: 'assigned_notify',
        ruleKey: seededRuleKey('review'),
        type: 'notify',
        config: { target: { kind: 'assigned' } },
        condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] },
        position: 5,
        active: true,
      })

      await evaluateTicketEscalations(db, ticket.id, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))
      const targeted = rows.filter(
        (row) => (row.target as Record<string, unknown>).ntfyTopic === topic,
      )

      expect(targeted).toHaveLength(1)
      expect(targeted[0]?.channel).toBe('ntfy')
      expect(targeted[0]?.eventType).toBe('ticket.escalated')
    })

    it('reaches nobody with the target assigned when the ticket has no technician', async () => {
      // Only the action with the target `assigned` may write a row with a
      // topic here: the fixed recipient of the other action would otherwise
      // hide the answer.
      await db
        .update(schema.escalationActions)
        .set({ active: false })
        .where(eq(schema.escalationActions.key, 'user_notify'))

      const ticket = await createTicket('critical')

      await db.insert(schema.escalationActions).values({
        key: 'assigned_notify_empty',
        ruleKey: seededRuleKey('review'),
        type: 'notify',
        config: { target: { kind: 'assigned' } },
        condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] },
        position: 6,
        active: true,
      })

      await evaluateTicketEscalations(db, ticket.id, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))
      const targeted = rows.filter(
        (row) => typeof (row.target as Record<string, unknown>).ntfyTopic === 'string',
      )

      expect(targeted).toHaveLength(0)
    })
  },
)
