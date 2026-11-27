import { randomUUID } from 'node:crypto'

import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateEscalations, evaluateTicketEscalations } from '../escalation'

/**
 * The waiting clock as a condition (WP-M45-03, ADR-0064, specs/07-escalation.md
 * §7.2, §7.4, §7.7, §7.11): the engine reads the `timer_expired` leaves of the
 * condition of a rule — the delay of the priority of the ticket from the start
 * value, the pauses excluded — and a stage rule without a timer is due from the
 * start of its wait.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation timer integration: ${testDatabase.reason}\n`)
}

const { escalationFirings, escalationRules, objects, ticketEvents, ticketPauses, tickets } = schema
const MINUTE = 60 * 1000

const minutes = (low: number, normal: number, high: number, critical: number) => ({
  low,
  normal,
  high,
  critical,
})

function timer(
  value: unknown,
  operator: 'expired' | 'notExpired' = 'expired',
): Record<string, unknown> {
  return { field: 'timer_expired', operator, value }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the engine reads the timer of a condition (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })
    const now = new Date('2026-11-27T12:00:00.000Z')
    let objectId = ''

    async function createTicket(input: {
      priority?: string
      reportedAt: Date
      deadlineAt?: Date
    }): Promise<string> {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'IN_REVIEW',
          priority: input.priority ?? 'normal',
          reportedAt: input.reportedAt,
          receivedAt: input.reportedAt,
          deadlineAt: input.deadlineAt ?? new Date(now.getTime() + 8 * 60 * MINUTE),
        })
        .returning({ id: tickets.id })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      return ticket.id
    }

    async function addEvent(ticketId: string, type: string, at: Date) {
      await db.insert(ticketEvents).values({ ticketId, type, actorKind: 'system', createdAt: at })
    }

    async function addRule(key: string, stageKey: string | null, condition: unknown) {
      await db.insert(escalationRules).values({
        key,
        stageKey,
        condition,
        position: 500,
        active: true,
      })
    }

    async function fired(ticketId: string): Promise<string[]> {
      const events = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))
        .orderBy(asc(ticketEvents.createdAt))

      return events
        .filter((event) => event.type === 'escalated')
        .map((event) => (event.payload as { rule: string }).rule)
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)
      // Only the rules of this file may fire: the seed rules are not under test.
      await db.update(escalationRules).set({ active: false })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `TMR-${randomUUID().slice(0, 6)}`, name: 'Timer probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''
    })

    // A test owns its rules: the next one starts without them.
    afterEach(async () => {
      await db.update(escalationRules).set({ active: false })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('fires once after the delay of the priority and a second scan is a no-op', async () => {
      await addRule('review#11', 'review', {
        all: [timer({ reference: 'received_at', minutes: minutes(30, 30, 30, 5) })],
      })
      const id = await createTicket({
        priority: 'critical',
        reportedAt: new Date(now.getTime() - 6 * MINUTE),
      })

      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(1)
      expect(await fired(id)).toEqual(['review#11'])
      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)
      expect(await evaluateEscalations(db, now)).toMatchObject({ fired: 0 })
      expect(await fired(id)).toEqual(['review#11'])

      const [row] = await db
        .select()
        .from(escalationFirings)
        .where(and(eq(escalationFirings.ticketId, id), eq(escalationFirings.ruleKey, 'review#11')))

      // The threshold of the firing log is the start value plus the delay of the priority.
      expect(row?.thresholdAt.getTime()).toBe(now.getTime() - 6 * MINUTE + 5 * MINUTE)
    })

    it('stays silent while the delay of another priority has not passed', async () => {
      const id = await createTicket({
        priority: 'normal',
        reportedAt: new Date(now.getTime() - 6 * MINUTE),
      })

      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)
      expect(await fired(id)).toEqual([])
    })

    it('stays silent while the start value never happened and fires after it', async () => {
      await addRule('work_order#11', 'work_order', {
        all: [timer({ reference: 'review_started', minutes: minutes(10, 10, 10, 10) })],
      })
      const id = await createTicket({ reportedAt: new Date(now.getTime() - 60 * MINUTE) })

      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)

      await addEvent(id, 'review_started', new Date(now.getTime() - 15 * MINUTE))

      expect((await evaluateTicketEscalations(db, id, now)).map((entry) => entry.rule)).toEqual([
        'work_order#11',
      ])
    })

    it('lets notExpired gate the firing', async () => {
      await addRule('assignment#11', 'assignment', {
        all: [
          timer({ reference: 'work_order_set', minutes: minutes(10, 10, 10, 10) }),
          timer({ reference: 'work_order_set', minutes: minutes(60, 60, 60, 60) }, 'notExpired'),
        ],
      })
      const id = await createTicket({ reportedAt: new Date(now.getTime() - 120 * MINUTE) })

      await addEvent(id, 'work_order_set', new Date(now.getTime() - 90 * MINUTE))
      // The first timer has expired, the second one — notExpired — has passed too.
      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)

      const young = await createTicket({ reportedAt: new Date(now.getTime() - 120 * MINUTE) })

      await addEvent(young, 'work_order_set', new Date(now.getTime() - 30 * MINUTE))
      expect(await evaluateTicketEscalations(db, young, now)).toHaveLength(1)
    })

    it('fires the percent timer at 80 percent and at 100 percent of the timeline', async () => {
      await addRule('deadline#11', null, { all: [timer({ percent: 80 })] })
      await addRule('deadline#12', null, { all: [timer({ percent: 100 })] })

      const at80 = await createTicket({
        reportedAt: new Date(now.getTime() - 90 * MINUTE),
        deadlineAt: new Date(now.getTime() + 22 * MINUTE),
      })

      expect((await evaluateTicketEscalations(db, at80, now)).map((entry) => entry.rule)).toEqual([
        'deadline#11',
      ])

      const overdue = await createTicket({
        reportedAt: new Date(now.getTime() - 120 * MINUTE),
        deadlineAt: new Date(now.getTime() - 5 * MINUTE),
      })

      expect(
        (await evaluateTicketEscalations(db, overdue, now)).map((entry) => entry.rule).sort(),
      ).toEqual(['deadline#11', 'deadline#12'])
    })

    it('fires a stage rule without a timer from the predecessor with zero delay', async () => {
      await addRule('acceptance#11', 'acceptance', { all: [] })
      const id = await createTicket({ reportedAt: new Date(now.getTime() - 60 * MINUTE) })

      // The predecessor `assignment` is not reached yet: the wait has not started.
      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)

      await addEvent(id, 'assigned', new Date(now.getTime() - 1 * MINUTE))

      const result = await evaluateTicketEscalations(db, id, now)

      expect(result.map((entry) => entry.rule)).toContain('acceptance#11')
      expect(result.find((entry) => entry.rule === 'acceptance#11')?.thresholdAt).toBe(
        new Date(now.getTime() - 1 * MINUTE).toISOString(),
      )
    })

    it('subtracts the pauses from the delay and moves the threshold by them', async () => {
      await addRule('acknowledgement#11', 'acknowledgement', {
        all: [timer({ reference: 'accepted', minutes: minutes(30, 30, 30, 30) })],
      })
      const id = await createTicket({ reportedAt: new Date(now.getTime() - 120 * MINUTE) })

      await addEvent(id, 'accepted', new Date(now.getTime() - 40 * MINUTE))
      await db.insert(ticketPauses).values({
        ticketId: id,
        reason: 'waiting on the reporter',
        startedAt: new Date(now.getTime() - 35 * MINUTE),
        endedAt: new Date(now.getTime() - 20 * MINUTE),
      })

      // 40 minutes since `accepted`, 15 of them paused: 25 < 30 — not due yet.
      expect(await evaluateTicketEscalations(db, id, now)).toHaveLength(0)

      const later = new Date(now.getTime() + 6 * MINUTE)
      const result = await evaluateTicketEscalations(db, id, later)

      // 46 − 15 = 31 ≥ 30: the threshold is start + 30 + the 15 paused minutes.
      expect(result.map((entry) => entry.rule)).toEqual(['acknowledgement#11'])
      expect(result[0]?.thresholdAt).toBe(
        new Date(now.getTime() - 40 * MINUTE + 45 * MINUTE).toISOString(),
      )
    })

    it('fires only when every expired timer of the condition has passed its delay', async () => {
      await addRule('review#12', 'review', {
        all: [
          timer({ reference: 'received_at', minutes: minutes(10, 10, 10, 10) }),
          timer({ reference: 'received_at', minutes: minutes(90, 90, 90, 90) }),
        ],
      })
      const id = await createTicket({ reportedAt: new Date(now.getTime() - 30 * MINUTE) })

      expect(
        (await evaluateTicketEscalations(db, id, now)).map((entry) => entry.rule),
      ).not.toContain('review#12')

      const old = await createTicket({ reportedAt: new Date(now.getTime() - 100 * MINUTE) })
      const result = await evaluateTicketEscalations(db, old, now)

      // The largest threshold wins: received_at + 90 minutes.
      expect(result.find((entry) => entry.rule === 'review#12')?.thresholdAt).toBe(
        new Date(now.getTime() - 100 * MINUTE + 90 * MINUTE).toISOString(),
      )
    })
  },
)
