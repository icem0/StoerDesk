import { randomUUID } from 'node:crypto'

import { asc, eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { evaluateEscalations, evaluateTicketEscalations } from '../escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation integration: ${testDatabase.reason}\n`)
}

const { objects, settings, ticketEvents, ticketPauses, tickets } = schema
const MINUTE = 60 * 1000

type EscalationPayload = {
  rule: string
  label: { de: string; en: string }
  description: { de: string; en: string }
}

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

  async function escalationPayloads(ticketId: string): Promise<EscalationPayload[]> {
    const events = await db
      .select({ type: ticketEvents.type, payload: ticketEvents.payload })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticketId))
      .orderBy(asc(ticketEvents.createdAt))

    return events
      .filter((event) => event.type === 'escalated')
      .map((event) => event.payload as EscalationPayload)
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

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

  it('fires new_without_review for a critical ticket after five minutes', async () => {
    const ticket = await createTicket({
      status: 'NEW',
      priority: 'critical',
      reportedAt: new Date(now.getTime() - 6 * MINUTE),
      deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
    })

    const result = await evaluateEscalations(db, now)

    expect(result.scanned).toBeGreaterThan(0)
    expect(await escalated(ticket.id)).toContain('new_without_review')

    await evaluateEscalations(db, now)
    expect(await escalated(ticket.id)).toEqual(['new_without_review'])
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

  it('writes the configured stage name and description into the event', async () => {
    await db.insert(settings).values([
      {
        key: 'ticket.escalation.new_without_review.label',
        value: { de: 'Sichtung', en: 'Triage' },
      },
      {
        key: 'ticket.escalation.new_without_review.description',
        value: { de: 'Sichtung noch nicht erfolgt', en: 'Triage not done yet' },
      },
    ])

    try {
      const ticket = await createTicket({
        status: 'NEW',
        priority: 'critical',
        reportedAt: new Date(now.getTime() - 6 * MINUTE),
        deadlineAt: new Date(now.getTime() + 2 * 60 * MINUTE),
      })

      await evaluateTicketEscalations(db, ticket.id, now)

      const payload = (await escalationPayloads(ticket.id)).find(
        (entry) => entry.rule === 'new_without_review',
      )

      expect(payload?.label).toEqual({ de: 'Sichtung', en: 'Triage' })
      expect(payload?.description).toEqual({
        de: 'Sichtung noch nicht erfolgt',
        en: 'Triage not done yet',
      })
    } finally {
      await db.delete(settings).where(like(settings.key, 'ticket.escalation.%'))
    }
  })
})
