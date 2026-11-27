import { randomUUID } from 'node:crypto'

import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
  externalTicketCreateRequestSchema,
} from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateEscalations, evaluateTicketEscalations } from '../escalation'
import { createExternalTicket } from '../external'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPauses, tickets, escalationRules, escalationStages } = schema
const MINUTE = 60 * 1000

/** The key of the seeded rule of a stage; the numbering is the identity (§7.5). */
function seededRuleKey(stageKey: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.stageKey === stageKey)

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

/** The key of the first stage of the default chain — the stage without a predecessor. */
function firstStageKey(): string {
  const stage = DEFAULT_WORKFLOW_ESCALATION_STAGES.find((entry) => entry.predecessor === null)

  if (stage === undefined) {
    throw new Error('expected a first stage without a predecessor')
  }

  return stage.key
}

describe.skipIf(testDatabase.status === 'unavailable')('escalation scan (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''
  let objectNo = ''
  const now = new Date('2026-11-05T12:00:00.000Z')

  async function createTicket(input: {
    status: string
    priority: string
    reportedAt: Date
    deadlineAt: Date
  }): Promise<{ id: string; ticketNo: string }> {
    const [ticket] = await db
      .insert(tickets)
      .values({ objectId, ...input, receivedAt: input.reportedAt })
      .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

    if (ticket === undefined) {
      throw new Error('ticket insert failed')
    }

    return ticket
  }

  async function escalated(ticketId: string) {
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

    const [object] = await db
      .insert(objects)
      .values({ objectNo: `ESC-${randomUUID().slice(0, 6)}`, name: 'Escalation probe' })
      .returning({ id: objects.id, objectNo: objects.objectNo })

    objectId = object?.id ?? ''
    objectNo = object?.objectNo ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('fires the rule of the stage Prüfung for a critical ticket after five minutes', async () => {
    const ticket = await createTicket({
      status: 'NEW',
      priority: 'critical',
      reportedAt: new Date(now.getTime() - 6 * MINUTE),
      deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
    })

    const result = await evaluateEscalations(db, now)

    expect(result.scanned).toBeGreaterThan(0)
    expect(await escalated(ticket.id)).toContain(seededRuleKey('review'))

    const fired = await escalated(ticket.id)

    await evaluateEscalations(db, now)
    expect(await escalated(ticket.id)).toEqual(fired)
  })

  it('fires the first stage rule immediately when the ticket is created', async () => {
    const created = await createExternalTicket(
      db,
      externalTicketCreateRequestSchema.parse({
        objectNo,
        priority: 'critical',
        description: 'First stage at creation',
      }),
      randomUUID(),
    )

    expect(await escalated(created.ticketId)).toEqual([seededRuleKey(firstStageKey())])
  })

  it('does not escalate a ticket that is paused', async () => {
    const ticket = await createTicket({
      status: 'NEW',
      priority: 'critical',
      reportedAt: new Date(now.getTime() - 20 * MINUTE),
      deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
    })

    await db.insert(ticketPauses).values({
      ticketId: ticket.id,
      reason: 'waiting on the reporter',
      startedAt: new Date(now.getTime() - 20 * MINUTE),
    })

    expect(await evaluateTicketEscalations(db, ticket.id, now)).toEqual([])
    expect(await escalated(ticket.id)).toEqual([])
  })

  it('fires the deadline rules for an overdue ticket', async () => {
    const reportedAt = new Date(now.getTime() - 100 * 60 * MINUTE)

    const ticket = await createTicket({
      status: 'IN_REVIEW',
      priority: 'normal',
      reportedAt,
      deadlineAt: new Date(now.getTime() - 4 * 60 * MINUTE),
    })

    await db.insert(ticketEvents).values([
      {
        ticketId: ticket.id,
        type: 'review_started',
        actorKind: 'system',
        createdAt: new Date(now.getTime() - 90 * MINUTE),
      },
      {
        ticketId: ticket.id,
        type: 'work_order_set',
        actorKind: 'system',
        createdAt: new Date(now.getTime() - 80 * MINUTE),
      },
      {
        ticketId: ticket.id,
        type: 'assigned',
        actorKind: 'system',
        createdAt: new Date(now.getTime() - 70 * MINUTE),
      },
      {
        ticketId: ticket.id,
        type: 'accepted',
        actorKind: 'system',
        createdAt: new Date(now.getTime() - 60 * MINUTE),
      },
      {
        ticketId: ticket.id,
        type: 'acknowledged',
        actorKind: 'system',
        createdAt: new Date(now.getTime() - 50 * MINUTE),
      },
    ])

    const fired = await evaluateTicketEscalations(db, ticket.id, now)
    const percentRules = [seededPercentRuleKey(80), seededPercentRuleKey(100)]

    expect(fired.map((entry) => entry.rule).filter((rule) => percentRules.includes(rule))).toEqual(
      percentRules,
    )
    expect((await escalated(ticket.id)).filter((rule) => percentRules.includes(rule))).toEqual(
      percentRules,
    )
  })

  it('keeps a rule silent when its condition does not match', async () => {
    await db.insert(escalationRules).values({
      key: 'review_critical_only',
      stageKey: 'review',
      reference: 'received_at',
      minutes: { low: 5, normal: 5, high: 5, critical: 5 },
      percent: null,
      condition: { all: [{ field: 'priority', operator: 'in', value: ['critical'] }] },
      position: 90,
      active: true,
    })

    const normal = await createTicket({
      status: 'NEW',
      priority: 'normal',
      reportedAt: new Date(now.getTime() - 30 * MINUTE),
      deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
    })

    const critical = await createTicket({
      status: 'NEW',
      priority: 'critical',
      reportedAt: new Date(now.getTime() - 30 * MINUTE),
      deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
    })

    await evaluateEscalations(db, now)

    expect(await escalated(normal.id)).not.toContain('review_critical_only')
    expect(await escalated(critical.id)).toContain('review_critical_only')
  })

  it('runs the clock of an intermediate stage from its predecessor and keeps an empty reached_by unreached', async () => {
    await db.insert(escalationStages).values([
      {
        key: 'night_shift',
        names: { de: 'Nachtdienst', en: 'Night shift' },
        position: 25,
        active: true,
        predecessor: 'work_order',
        reachedBy: ['claimed'],
      },
      {
        key: 'orphan',
        names: { de: 'Ohne Ereignis', en: 'No event' },
        position: 26,
        active: true,
        predecessor: 'work_order',
        reachedBy: [],
      },
    ])

    await db.insert(escalationRules).values([
      {
        key: 'night_shift',
        stageKey: 'night_shift',
        reference: null,
        minutes: { low: 10, normal: 10, high: 10, critical: 10 },
        percent: null,
        condition: { all: [] },
        position: 91,
        active: true,
      },
      {
        key: 'orphan',
        stageKey: 'orphan',
        reference: null,
        minutes: { low: 10, normal: 10, high: 10, critical: 10 },
        percent: null,
        condition: { all: [] },
        position: 92,
        active: true,
      },
    ])

    async function ticketWithWorkOrder() {
      const ticket = await createTicket({
        status: 'WORK_ORDER_CREATED',
        priority: 'normal',
        reportedAt: new Date(now.getTime() - 60 * MINUTE),
        deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
      })

      await db.insert(ticketEvents).values([
        {
          ticketId: ticket.id,
          type: 'review_started',
          actorKind: 'system',
          payload: {},
          createdAt: new Date(now.getTime() - 40 * MINUTE),
        },
        {
          ticketId: ticket.id,
          type: 'work_order_set',
          actorKind: 'system',
          payload: {},
          createdAt: new Date(now.getTime() - 20 * MINUTE),
        },
      ])

      return ticket
    }

    const unreached = await ticketWithWorkOrder()

    expect(
      (await evaluateTicketEscalations(db, unreached.id, now)).map((entry) => entry.rule),
    ).toEqual(expect.arrayContaining(['night_shift', 'orphan']))

    const reached = await ticketWithWorkOrder()

    await db.insert(ticketEvents).values({
      ticketId: reached.id,
      type: 'claimed',
      actorKind: 'system',
      payload: {},
      createdAt: new Date(now.getTime() - 19 * MINUTE),
    })

    expect(
      (await evaluateTicketEscalations(db, reached.id, now)).map((entry) => entry.rule),
    ).not.toContain('night_shift')
  })
  describe('the waiting clock as a condition (ADR-0064, WP-M45-02)', () => {
    const timer = (value: unknown, operator = 'expired') => ({
      field: 'timer_expired',
      operator,
      value,
    })

    async function ticketWithReview(input: {
      priority: string
      receivedMinutesAgo: number
      reviewMinutesAgo?: number
    }) {
      const ticket = await createTicket({
        status: 'IN_REVIEW',
        priority: input.priority,
        reportedAt: new Date(now.getTime() - input.receivedMinutesAgo * MINUTE),
        deadlineAt: new Date(now.getTime() + 10 * 60 * MINUTE),
      })

      if (input.reviewMinutesAgo !== undefined) {
        await db.insert(ticketEvents).values({
          ticketId: ticket.id,
          type: 'review_started',
          actorKind: 'system',
          payload: {},
          createdAt: new Date(now.getTime() - input.reviewMinutesAgo * MINUTE),
        })
      }

      return ticket
    }

    const rulesOf = async (ticketId: string) =>
      (await evaluateTicketEscalations(db, ticketId, now)).map((entry) => entry.rule)

    beforeAll(async () => {
      await db.insert(escalationRules).values([
        {
          key: 'timer_priority',
          stageKey: 'work_order',
          reference: null,
          minutes: null,
          percent: null,
          condition: {
            all: [
              timer({
                reference: 'review_started',
                minutes: { low: 60, normal: 60, high: 10, critical: 10 },
              }),
            ],
          },
          position: 93,
          active: true,
        },
        {
          key: 'timer_offered',
          stageKey: 'acknowledgement',
          reference: null,
          minutes: null,
          percent: null,
          condition: {
            all: [
              timer({ reference: 'offered', minutes: { low: 1, normal: 1, high: 1, critical: 1 } }),
            ],
          },
          position: 94,
          active: true,
        },
        {
          key: 'timer_not_expired',
          stageKey: 'work_order',
          reference: null,
          minutes: null,
          percent: null,
          condition: {
            all: [
              timer(
                {
                  reference: 'received_at',
                  minutes: { low: 30, normal: 30, high: 30, critical: 30 },
                },
                'notExpired',
              ),
            ],
          },
          position: 95,
          active: true,
        },
        {
          key: 'timer_first',
          stageKey: 'new',
          reference: null,
          minutes: null,
          percent: null,
          condition: {
            all: [
              timer({
                reference: 'received_at',
                minutes: { low: 600, normal: 600, high: 600, critical: 600 },
              }),
            ],
          },
          position: 96,
          active: true,
        },
      ])
    })

    it('fires a timer past the delay of the priority once, at the moment it expired', async () => {
      const high = await ticketWithReview({
        priority: 'high',
        receivedMinutesAgo: 30,
        reviewMinutesAgo: 15,
      })
      const fired = await evaluateTicketEscalations(db, high.id, now)
      const firing = fired.find((entry) => entry.rule === 'timer_priority')

      expect(firing?.thresholdAt).toBe(new Date(now.getTime() - 5 * MINUTE).toISOString())
      expect(await rulesOf(high.id)).not.toContain('timer_priority')
      expect((await escalated(high.id)).filter((rule) => rule === 'timer_priority')).toHaveLength(1)

      const normal = await ticketWithReview({
        priority: 'normal',
        receivedMinutesAgo: 30,
        reviewMinutesAgo: 15,
      })

      expect(await rulesOf(normal.id)).not.toContain('timer_priority')
    })

    it('stops the timer during a pause', async () => {
      const ticket = await ticketWithReview({
        priority: 'high',
        receivedMinutesAgo: 30,
        reviewMinutesAgo: 15,
      })

      await db.insert(ticketPauses).values({
        ticketId: ticket.id,
        reason: 'waiting on the reporter',
        startedAt: new Date(now.getTime() - 14 * MINUTE),
        endedAt: new Date(now.getTime() - 4 * MINUTE),
      })

      expect(await rulesOf(ticket.id)).not.toContain('timer_priority')
    })

    it('keeps a timer silent while its start value never happened', async () => {
      const ticket = await ticketWithReview({
        priority: 'normal',
        receivedMinutesAgo: 120,
        reviewMinutesAgo: 110,
      })

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'accepted',
        actorKind: 'system',
        payload: {},
        createdAt: new Date(now.getTime() - 60 * MINUTE),
      })

      expect(await rulesOf(ticket.id)).not.toContain('timer_offered')
    })

    it('fires a rule without an expired timer with zero delay from its stage and lets notExpired gate it', async () => {
      const fresh = await ticketWithReview({
        priority: 'normal',
        receivedMinutesAgo: 10,
        reviewMinutesAgo: 5,
      })
      const fired = await evaluateTicketEscalations(db, fresh.id, now)

      expect(fired.find((entry) => entry.rule === 'timer_not_expired')?.thresholdAt).toBe(
        new Date(now.getTime() - 5 * MINUTE).toISOString(),
      )

      const old = await ticketWithReview({
        priority: 'normal',
        receivedMinutesAgo: 60,
        reviewMinutesAgo: 5,
      })

      expect(await rulesOf(old.id)).not.toContain('timer_not_expired')

      const unreviewed = await ticketWithReview({ priority: 'normal', receivedMinutesAgo: 10 })

      expect(await rulesOf(unreviewed.id)).not.toContain('timer_not_expired')
    })

    it('fires a rule of the first stage with the ticket, independent of its timer', async () => {
      const ticket = await ticketWithReview({ priority: 'normal', receivedMinutesAgo: 0 })

      expect(await rulesOf(ticket.id)).toContain('timer_first')
    })
  })
})
