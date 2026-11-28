import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_RULES, escalationTimerLeaves, type EscalationFacts } from '@stoerdesk/shared'

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
  escalationRules,
  groups,
  notificationAccounts,
  objects,
  oncallPools,
  oncallShifts,
  outbox,
  ticketEvents,
  tickets,
  userGroups,
  users,
} = schema

const MINUTE = 60 * 1000

/** The key of the seeded rule of a stage; the numbering is the identity (§7.5). */
function seededRuleKey(stageKey: string, reference?: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find(
    (entry) =>
      entry.stageKey === stageKey &&
      (reference === undefined ||
        escalationTimerLeaves(entry.condition).some(
          (timer) => 'reference' in timer.value && timer.value.reference === reference,
        )),
  )

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of the stage ${stageKey}`)
  }

  return rule.key
}

/** The key of the seeded deadline rule of a percentage. */
function seededPercentRuleKey(percent: number): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) =>
    escalationTimerLeaves(entry.condition).some(
      (timer) => 'percent' in timer.value && timer.value.percent === percent,
    ),
  )

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


    /** The `assign` action with a target (§7.14, ADR-0057). */
    async function assignTargetAction(
      target: { kind: string; id: string },
      acceptance: boolean,
      key: string,
      ruleKey: string,
    ) {
      await db.insert(escalationActions).values({
        key,
        ruleKey,
        type: 'assign',
        config: { target, acceptance },
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

    it('assigns the ticket to the first member of the group', async () => {
      await action(
        'assign',
        { kind: 'group', id: groupId },
        'assign_group',
        seededRuleKey('assignment'),
      )

      for (const [index, userId] of technicianIds.entries()) {
        await db.insert(notificationAccounts).values({
          userId,
          channel: 'ntfy',
          externalId: `topic-${index}`,
          verifiedAt: new Date(),
        })
      }

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('assignment'), 'assignment', 'e1')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({
          status: tickets.status,
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('ASSIGNED')
      expect(moved?.assignedUserId).toBe(technicianIds[0])
      expect(moved?.assignmentStatus).toBe('offered')

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const note = events.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        rule: seededRuleKey('assignment'),
        stage: 'assignment',
        assignee: technicianIds[0],
      })

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(rows).toHaveLength(1)
      expect(rows.every((row) => row.channel === 'ntfy')).toBe(true)
      expect(rows.every((row) => row.eventType === 'ticket.assigned')).toBe(true)
      expect((rows.map((row) => row.target as { ntfyTopic: string }).map((t) => t.ntfyTopic)).sort())
        .toStrictEqual(['topic-0'])
    })

    it('assigns the ticket to the first member of the readiness pool', async () => {
      await assignTargetAction(
        { kind: 'pool', id: poolId },
        true,
        'assign_target_pool',
        seededRuleKey('review'),
      )

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('review'), 'assignment', 'e8')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.assignedUserId).toBe(technicianIds[0])
      expect(moved?.assignmentStatus).toBe('offered')
    })

    it('assigns the ticket to the named technician', async () => {
      await assignTargetAction(
        { kind: 'user', id: technicianIds[0] ?? '' },
        false,
        'assign_target_user',
        seededRuleKey('work_order'),
      )

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('work_order'), null, 'e9')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.assignedUserId).toBe(technicianIds[0])
      // Without the acceptance the assignment is accepted at once.
      expect(moved?.assignmentStatus).toBe('accepted')
    })


    it('assigns the ticket to the first member of the target', async () => {
      const ruleKey = `assign_target_${randomUUID().slice(0, 6)}`

      await db.insert(escalationRules).values({
        key: ruleKey,
        stageKey: null,
        condition: {
          all: [{ field: 'timer_expired', operator: 'expired', value: { percent: 50 } }],
        },
        position: 900,
        active: true,
      })
      await assignTargetAction({ kind: 'group', id: groupId }, true, 'assign_target_group', ruleKey)

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, ruleKey, null, 'e-target')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
          assignmentTargetKind: tickets.assignmentTargetKind,
          assignmentTargetId: tickets.assignmentTargetId,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      // The members of the group are ordered by name — Alpha before Beta.
      expect(moved?.assignedUserId).toBe(technicianIds[0])
      expect(moved?.assignmentStatus).toBe('offered')
      expect(moved?.assignmentTargetKind).toBe('group')
      expect(moved?.assignmentTargetId).toBe(groupId)
    })

    it('offers the ticket to the technicians of a readiness pool', async () => {
      const onCallUserId = technicianIds[0] ?? ''

      await action('offer', { kind: 'pool', id: poolId }, 'offer_pool', seededRuleKey('acceptance', 'offered'))

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

      // Both technicians of the pool are notified: the one who selected ntfy
      // for the escalation and the one without a selection, who keeps their
      // own ntfy topic (ADR-0037).
      expect(rows).toHaveLength(2)
      expect(rows.every((row) => row.channel === 'ntfy')).toBe(true)
      expect(rows.every((row) => row.eventType === 'ticket.escalated')).toBe(true)
      expect((rows.map((row) => row.target as { ntfyTopic: string }).map((t) => t.ntfyTopic)).sort())
        .toStrictEqual(['topic-0', 'topic-1'])
    })

    it('assigns the ticket to one named technician', async () => {
      const technicianId = technicianIds[0] ?? ''

      await assignTargetAction(
        { kind: 'user', id: technicianId },
        true,
        'assign_target_named',
        seededRuleKey('new'),
      )

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('new'), 'new', 'e6')

      expect(result.assigned).toBe(1)

      const [moved] = await db
        .select({
          status: tickets.status,
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
        })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('ASSIGNED')
      expect(moved?.assignedUserId).toBe(technicianId)
      expect(moved?.assignmentStatus).toBe('offered')

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const note = events.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        assignee: technicianId,
      })
    })

    it('offers the ticket to one named technician and names him', async () => {
      const technicianId = technicianIds[1] ?? ''

      await action(
        'offer',
        { kind: 'user', id: technicianId },
        'offer_user',
        seededRuleKey('acknowledgement'),
      )

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, seededRuleKey('acknowledgement'), 'acknowledgement', 'e7')

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
      expect(moved?.offeredToUserId).toBe(technicianId)
      expect(moved?.offerEscalatedAt).toBeNull()
    })

    it('changes nothing for a target without a technician', async () => {
      const [emptyGroup] = await db
        .insert(groups)
        .values({ name: `Leer ${randomUUID().slice(0, 6)}` })
        .returning({ id: groups.id })

      // An empty group has nobody (§7.14, ADR-0057).
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
