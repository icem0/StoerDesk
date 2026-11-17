import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_RULES, type EscalationFacts } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { dispatchEscalationActions } from '../actions'

/**
 * The distribution of a ticket by the escalation (`specs/07-escalation.md`
 * §7.14, ADR-0026, WP-M14-82): the `offer` and the `assign` action hand the
 * ticket to the technicians of a readiness pool or of a user group.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation distribution integration: ${testDatabase.reason}\n`)
}

const {
  escalationActions,
  groups,
  notificationAccounts,
  notificationPreferences,
  objects,
  oncallPools,
  oncallShifts,
  outbox,
  ticketAssignees,
  ticketEvents,
  tickets,
  userGroups,
  users,
} = schema

const MINUTE = 60 * 1000

/** The key of the seeded rule of a stage; the numbering is the identity (§7.5). */
function seededRuleKey(stageKey: string, reference?: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find(
    (entry) => entry.stageKey === stageKey && (reference === undefined || entry.reference === reference),
  )

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of the stage ${stageKey}`)
  }

  return rule.key
}

/** The key of the seeded deadline rule of a percentage. */
function seededPercentRuleKey(percent: number): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.percent === percent)

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of ${percent} percent`)
  }

  return rule.key
}

const facts: EscalationFacts = {
  priority: 'normal',
  status: 'WORK_ORDER_CREATED',
  source: 'INTERNAL',
  systemType: null,
  objectExternalType: null,
  assigned: false,
  deadlinePercent: 50,
  elapsedMinutes: 30,
  paused: false,
  stageReached: ['review', 'work_order'],
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the distribution of a ticket (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let objectId = ''
    let groupId = ''
    let poolId = ''
    const technicianIds: string[] = []

    async function createTicket(status: string) {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status,
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: new Date(Date.now() - 30 * MINUTE),
          receivedAt: new Date(Date.now() - 30 * MINUTE),
          deadlineAt: new Date(Date.now() + 42 * 60 * MINUTE),
        })
        .returning({ id: tickets.id })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      return ticket
    }

    async function action(
      type: 'offer' | 'assign',
      target: { kind: string; id: string },
      key: string,
      ruleKey: string,
    ) {
      await db.insert(escalationActions).values({
        key,
        ruleKey,
        type,
        config: { target },
        condition: { all: [] },
        position: 0,
        active: true,
      })
    }

    async function fire(
      ticketId: string,
      ruleKey: string,
      stageKey: string | null,
      eventId: string,
    ) {
      return dispatchEscalationActions(
        db,
        { ticketId, ruleKey, stageKey, eventId },
        facts,
      )
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `DIST-${randomUUID().slice(0, 6)}`, name: 'Verteilerprobe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      const [group] = await db
        .insert(groups)
        .values({ name: `Bereitschaft ${randomUUID().slice(0, 6)}` })
        .returning({ id: groups.id })

      groupId = group?.id ?? ''

      for (const name of ['Alpha', 'Beta']) {
        const [technician] = await db
          .insert(users)
          .values({
            email: `verteiler-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.org`,
            givenName: name,
            familyName: 'Techniker',
            passwordHash: 'no-login',
          })
          .returning({ id: users.id })

        if (technician !== undefined) {
          technicianIds.push(technician.id)
          await db.insert(userGroups).values({ userId: technician.id, groupId })
        }
      }

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Pool ${randomUUID().slice(0, 6)}`, groupId })
        .returning({ id: oncallPools.id })

      poolId = pool?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('assigns the ticket to every technician of a group', async () => {
      await action('assign', { kind: 'group', id: groupId }, 'assign_group', 'assignment')

      for (const [index, userId] of technicianIds.entries()) {
        await db.insert(notificationAccounts).values({
          userId,
          channel: 'ntfy',
          externalId: `topic-${index}`,
        })
        await db.insert(notificationPreferences).values({
          userId,
          eventType: 'ticket.assigned',
          channel: 'ntfy',
        })
      }

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, 'assignment', 'assignment', 'e1')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('ASSIGNED')

      const assignees = await db
        .select({ userId: ticketAssignees.userId })
        .from(ticketAssignees)
        .where(eq(ticketAssignees.ticketId, ticket.id))

      expect(assignees.map((row) => row.userId).sort()).toStrictEqual([...technicianIds].sort())

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const note = events.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        rule: 'assignment',
        stage: 'assignment',
        target: { kind: 'group', id: groupId },
      })

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(rows).toHaveLength(2)
      expect(rows.every((row) => row.channel === 'ntfy')).toBe(true)
      expect(rows.every((row) => row.eventType === 'ticket.assigned')).toBe(true)
      expect((rows.map((row) => row.target as { ntfyTopic: string }).map((t) => t.ntfyTopic)).sort())
        .toStrictEqual(['topic-0', 'topic-1'])
    })

    it('offers the ticket to the technicians of a readiness pool', async () => {
      await action('offer', { kind: 'pool', id: poolId }, 'offer_pool', seededRuleKey('acceptance', 'offered'))

      const onCallUserId = technicianIds[0] ?? ''

      await db.insert(oncallShifts).values({
        poolId,
        userId: onCallUserId,
        state: 'CONFIRMED',
        startsAt: new Date(Date.now() - 10 * MINUTE),
        endsAt: new Date(Date.now() + 120 * MINUTE),
      })

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('acceptance', 'offered'), 'acceptance', 'e2')

      expect(result.offered).toBe(1)

      const [moved] = await db
        .select({
          status: tickets.status,
          offeredToUserId: tickets.offeredToUserId,
          offerEscalatedAt: tickets.offerEscalatedAt,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('OFFERED')
      expect(moved?.offeredToUserId).toBe(onCallUserId)
      expect(moved?.offerEscalatedAt).toBeInstanceOf(Date)

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const note = events.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        target: { kind: 'pool', id: poolId },
      })
    })

    it('offers a pool without a covering shift without a person and notifies the technicians', async () => {
      const [nightPool] = await db
        .insert(oncallPools)
        .values({ name: `Nacht ${randomUUID().slice(0, 6)}`, groupId })
        .returning({ id: oncallPools.id })

      await action('offer', { kind: 'pool', id: nightPool?.id ?? '' }, 'offer_night', seededRuleKey('acceptance', 'assigned'))

      const onCallUserId = technicianIds[0] ?? ''

      await db.insert(notificationPreferences).values({
        userId: onCallUserId,
        eventType: 'ticket.escalated',
        channel: 'ntfy',
      })

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('acceptance', 'assigned'), null, 'e5')

      expect(result.offered).toBe(1)

      const [moved] = await db
        .select({
          status: tickets.status,
          offeredToUserId: tickets.offeredToUserId,
          offerEscalatedAt: tickets.offerEscalatedAt,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('OFFERED')
      expect(moved?.offeredToUserId).toBeNull()
      expect(moved?.offerEscalatedAt).toBeNull()

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventType).toBe('ticket.escalated')
      expect((rows[0]?.target as { ntfyTopic: string }).ntfyTopic).toBe('topic-0')
    })

    it('changes nothing when the ticket has no step for the distribution', async () => {
      await action('assign', { kind: 'group', id: groupId }, 'assign_review_step', 'work_order')

      const ticket = await createTicket('NEW')

      const result = await fire(ticket.id, 'work_order', 'work_order', 'e3')

      expect(result.assigned).toBe(0)
      expect(result.offered).toBe(0)

      const [unchanged] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(unchanged?.status).toBe('NEW')

      const assignees = await db
        .select({ userId: ticketAssignees.userId })
        .from(ticketAssignees)
        .where(eq(ticketAssignees.ticketId, ticket.id))

      expect(assignees).toHaveLength(0)

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      expect(events.find((event) => event.type === 'escalation_note')).toBeUndefined()
    })

    it('changes nothing for a target without a technician', async () => {
      const [emptyGroup] = await db
        .insert(groups)
        .values({ name: `Leer ${randomUUID().slice(0, 6)}` })
        .returning({ id: groups.id })

      await action('assign', { kind: 'group', id: emptyGroup?.id ?? '' }, 'assign_empty', seededPercentRuleKey(100))

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededPercentRuleKey(100), null, 'e4')

      expect(result.assigned).toBe(0)

      const [unchanged] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(unchanged?.status).toBe('WORK_ORDER_CREATED')
    })
  },
)
