import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { EscalationFacts } from '@stoerdesk/shared'

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

const { escalationActions, groups, objects, oncallPools, ticketAssignees, ticketEvents, tickets, userGroups, users } =
  schema

const MINUTE = 60 * 1000

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
    })

    it('offers the ticket to the technicians of a readiness pool', async () => {
      await action('offer', { kind: 'pool', id: poolId }, 'offer_pool', 'acceptance_offer')

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, 'acceptance_offer', 'acceptance', 'e2')

      expect(result.offered).toBe(1)

      const [moved] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1)

      expect(moved?.status).toBe('OFFERED')

      const events = await db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id))

      const note = events.find((event) => event.type === 'escalation_note')

      expect(note?.payload).toMatchObject({
        target: { kind: 'pool', id: poolId },
      })
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

      await action('assign', { kind: 'group', id: emptyGroup?.id ?? '' }, 'assign_empty', 'deadline_exceeded')

      const ticket = await createTicket('WORK_ORDER_CREATED')

      const result = await fire(ticket.id, 'deadline_exceeded', null, 'e4')

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
