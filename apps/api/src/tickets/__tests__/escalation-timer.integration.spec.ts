import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateTicketEscalations } from '../escalation'

/**
 * The waiting clock of a rule is the `timer_expired` leaf of its condition
 * (ADR-0064, `specs/07-escalation.md` §7.4, §7.7, WP-M45-03): the delay of the
 * priority of the ticket from the start value, the pauses excluded, one firing
 * per ticket, rule and threshold.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation timer integration: ${testDatabase.reason}\n`)
}

const { escalationFirings, escalationRules, objects, ticketEvents, ticketPauses, tickets } = schema
const MINUTE = 60 * 1000
const DELAYS = { low: 40, normal: 30, high: 20, critical: 10 }

function timer(reference: string, operator: 'expired' | 'notExpired' = 'expired') {
  return { field: 'timer_expired', operator, value: { reference, minutes: DELAYS } }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the timer of an escalation rule (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })
    const now = new Date('2026-11-27T12:00:00.000Z')
    let objectId = ''

    /** A rule of the stage `work_order` with its condition. */
    async function rule(key: string, condition: unknown): Promise<void> {
      await db.insert(escalationRules).values({
        key,
        stageKey: 'work_order',
        condition,
        position: 80,
        active: true,
      })
    }

    /** A ticket whose review started `reviewMinutesAgo` minutes before now. */
    async function ticketInReview(priority: string, reviewMinutesAgo: number | null) {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'IN_REVIEW',
          priority,
          reportedAt: new Date(now.getTime() - 120 * MINUTE),
          receivedAt: new Date(now.getTime() - 120 * MINUTE),
          deadlineAt: new Date(now.getTime() + 24 * 60 * MINUTE),
        })
        .returning({ id: tickets.id })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      if (reviewMinutesAgo !== null) {
        await db.insert(ticketEvents).values({
          ticketId: ticket.id,
          type: 'review_started',
          actorKind: 'system',
          payload: {},
          createdAt: new Date(now.getTime() - reviewMinutesAgo * MINUTE),
        })
      }

      return ticket.id
    }

    async function firedRules(ticketId: string, at: Date = now): Promise<string[]> {
      return (await evaluateTicketEscalations(db, ticketId, at)).map((entry) => entry.rule)
    }

    async function thresholdOf(ticketId: string, ruleKey: string): Promise<string[]> {
      const rows = await db
        .select({ thresholdAt: escalationFirings.thresholdAt })
        .from(escalationFirings)
        .where(
          and(eq(escalationFirings.ticketId, ticketId), eq(escalationFirings.ruleKey, ruleKey)),
        )

      return rows.map((row) => row.thresholdAt.toISOString())
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `TMR-${randomUUID().slice(0, 6)}`, name: 'Timer probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      await rule('timer_review', { all: [timer('review_started')] })
      await rule('timer_gate', {
        all: [timer('review_started'), timer('review_started', 'notExpired')],
      })
      await rule('timer_any', {
        any: [timer('review_started'), timer('accepted')],
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('fires once the delay of the priority has passed and a second scan is a no-op', async () => {
      const ticketId = await ticketInReview('critical', 25)

      expect(await firedRules(ticketId)).toContain('timer_review')
      expect(await firedRules(ticketId)).not.toContain('timer_review')
      expect(await thresholdOf(ticketId, 'timer_review')).toEqual([
        new Date(now.getTime() - 15 * MINUTE).toISOString(),
      ])
    })

    it('keeps the rule silent while the delay of the priority of the ticket runs', async () => {
      const ticketId = await ticketInReview('normal', 25)

      expect(await firedRules(ticketId)).not.toContain('timer_review')
      expect(await firedRules(ticketId, new Date(now.getTime() + 5 * MINUTE))).toContain(
        'timer_review',
      )
    })

    it('keeps the rule silent while its start value never happened', async () => {
      const ticketId = await ticketInReview('critical', null)

      expect(await firedRules(ticketId)).not.toContain('timer_review')
    })

    it('lets a notExpired timer gate the firing', async () => {
      const ticketId = await ticketInReview('critical', 25)

      expect(await firedRules(ticketId)).not.toContain('timer_gate')
    })

    it('fires an any group with the first timer that expired', async () => {
      const ticketId = await ticketInReview('critical', 25)

      expect(await firedRules(ticketId)).toContain('timer_any')
      expect(await thresholdOf(ticketId, 'timer_any')).toEqual([
        new Date(now.getTime() - 15 * MINUTE).toISOString(),
      ])
    })

    it('stops the clock during a pause and moves the threshold behind it', async () => {
      const ticketId = await ticketInReview('critical', 25)

      await db.insert(ticketPauses).values({
        ticketId,
        reason: 'waiting on the reporter',
        startedAt: new Date(now.getTime() - 20 * MINUTE),
        endedAt: new Date(now.getTime() - 2 * MINUTE),
      })

      expect(await firedRules(ticketId)).not.toContain('timer_review')
      expect(await firedRules(ticketId, new Date(now.getTime() + 3 * MINUTE))).toContain(
        'timer_review',
      )
      expect(await thresholdOf(ticketId, 'timer_review')).toEqual([
        new Date(now.getTime() + 3 * MINUTE).toISOString(),
      ])
    })
  },
)
