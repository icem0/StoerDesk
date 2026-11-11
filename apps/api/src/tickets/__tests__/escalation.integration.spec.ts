import { randomUUID } from 'node:crypto'

import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateEscalations, evaluateTicketEscalations } from '../escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPauses, tickets, escalationRules } = schema
const MINUTE = 60 * 1000

describe.skipIf(testDatabase.status === 'unavailable')('escalation scan (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''
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
      .returning({ id: objects.id })

    objectId = object?.id ?? ''
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
    expect(await escalated(ticket.id)).toContain('review')

    await evaluateEscalations(db, now)
    expect(await escalated(ticket.id)).toEqual(['review'])
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

    const fired = await evaluateTicketEscalations(db, ticket.id, now)

    expect(fired.map((entry) => entry.rule)).toEqual([
      'deadline_80_percent',
      'deadline_exceeded',
    ])
    expect(await escalated(ticket.id)).toEqual([
      'deadline_80_percent',
      'deadline_exceeded',
    ])
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
})
