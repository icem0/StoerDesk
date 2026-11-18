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
  process.stderr.write(`skipped readiness shift integration: ${testDatabase.reason}\n`)
}

const {
  escalationActions,
  escalationRules,
  groups,
  notificationAccounts,
  notificationPreferences,
  objects,
  oncallPools,
  oncallShifts,
  outbox,
  tickets,
  ticketEvents,
  userGroups,
  users,
} = schema
const MINUTE = 60 * 1000
const RULE_KEY = 'readiness_shift'

describe.skipIf(testDatabase.status === 'unavailable')(
  'the readiness shift in a condition (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const now = new Date('2026-11-05T12:00:00.000Z')
    let objectId = ''
    let poolId = ''
    let shiftId = ''
    let onDutyTopic = ''
    let offDutyTopic = ''

    async function createTicket() {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority: 'critical',
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

    async function escalatedRules(ticketId: string): Promise<string[]> {
      const events = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

      return events
        .filter((event) => event.type === 'escalated')
        .map((event) => (event.payload as { rule: string }).rule)
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `SHIFT-${randomUUID().slice(0, 6)}`, name: 'Readiness probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      onDutyTopic = `stoerdesk-${randomUUID().slice(0, 8)}`
      offDutyTopic = `stoerdesk-${randomUUID().slice(0, 8)}`

      const team = await db
        .insert(users)
        .values([
          {
            email: `on-duty-${randomUUID().slice(0, 8)}@example.invalid`,
            passwordHash: 'not-a-real-hash',
            givenName: 'Ida',
            familyName: 'OnDuty',
          },
          {
            email: `off-duty-${randomUUID().slice(0, 8)}@example.invalid`,
            passwordHash: 'not-a-real-hash',
            givenName: 'Otto',
            familyName: 'OffDuty',
          },
        ])
        .returning({ id: users.id })

      const [onDuty, offDuty] = team

      if (onDuty === undefined || offDuty === undefined) {
        throw new Error('user insert failed')
      }

      await db.insert(notificationAccounts).values([
        { userId: onDuty.id, channel: 'ntfy', externalId: onDutyTopic },
        { userId: offDuty.id, channel: 'ntfy', externalId: offDutyTopic },
      ])
      await db.insert(notificationPreferences).values([
        { userId: onDuty.id, eventType: 'ticket.escalated', channel: 'ntfy' },
        { userId: offDuty.id, eventType: 'ticket.escalated', channel: 'ntfy' },
      ])

      const [group] = await db
        .insert(groups)
        .values({ name: `Bereitschaft ${randomUUID().slice(0, 6)}` })
        .returning({ id: groups.id })

      if (group === undefined) {
        throw new Error('group insert failed')
      }

      await db.insert(userGroups).values([
        { groupId: group.id, userId: onDuty.id },
        { groupId: group.id, userId: offDuty.id },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Pool ${randomUUID().slice(0, 6)}`, groupId: group.id })
        .returning({ id: oncallPools.id })

      if (pool === undefined) {
        throw new Error('pool insert failed')
      }

      poolId = pool.id

      const [shift] = await db
        .insert(oncallShifts)
        .values({
          poolId: pool.id,
          userId: onDuty.id,
          state: 'CONFIRMED',
          startsAt: new Date(now.getTime() - 60 * MINUTE),
          endsAt: new Date(now.getTime() + 60 * MINUTE),
        })
        .returning({ id: oncallShifts.id })

      if (shift === undefined) {
        throw new Error('shift insert failed')
      }

      shiftId = shift.id

      await db.insert(escalationRules).values({
        key: RULE_KEY,
        stageKey: 'review',
        reference: 'received_at',
        minutes: { low: 5, normal: 5, high: 5, critical: 5 },
        percent: null,
        condition: { all: [{ field: 'shift', operator: 'eq', value: pool.id }] },
        position: 95,
        active: true,
      })

      await db.insert(escalationActions).values({
        key: 'readiness_shift_notify',
        ruleKey: RULE_KEY,
        type: 'notify',
        config: { target: { kind: 'pool', id: pool.id } },
        condition: { all: [] },
        position: 0,
        active: true,
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('fires the rule of a staffed pool and notifies the technician on duty only', async () => {
      const ticket = await createTicket()

      await evaluateTicketEscalations(db, ticket.id, now)

      expect(await escalatedRules(ticket.id)).toContain(RULE_KEY)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))
      const topics = rows.map((row) => (row.target as Record<string, unknown>).ntfyTopic)

      expect(topics).toContain(onDutyTopic)
      expect(topics).not.toContain(offDutyTopic)
    })

    it('keeps the rule silent when the pool has no staffed shift', async () => {
      await db
        .update(oncallShifts)
        .set({ endsAt: new Date(now.getTime() - 30 * MINUTE) })
        .where(eq(oncallShifts.id, shiftId))

      const ticket = await createTicket()

      await evaluateTicketEscalations(db, ticket.id, now)

      expect(await escalatedRules(ticket.id)).not.toContain(RULE_KEY)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(rows).toHaveLength(0)
    })

    it('asks for the pool without a shift with the operator ne', async () => {
      await db
        .update(escalationRules)
        .set({ condition: { all: [{ field: 'shift', operator: 'ne', value: poolId }] } })
        .where(eq(escalationRules.key, RULE_KEY))

      const ticket = await createTicket()

      await evaluateTicketEscalations(db, ticket.id, now)

      expect(await escalatedRules(ticket.id)).toContain(RULE_KEY)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticket.id))

      expect(rows).toHaveLength(0)
    })
  },
)
