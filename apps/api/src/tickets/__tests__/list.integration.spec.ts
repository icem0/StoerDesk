import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { listTickets } from '../list'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket list integration: ${testDatabase.reason}\n`)
}

const { objects, tickets } = schema

describe.skipIf(testDatabase.status === 'unavailable')('ticket list (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [object] = await db
      .insert(objects)
      .values({ objectNo: `TL-${randomUUID().slice(0, 6)}`, name: 'List probe' })
      .returning({ id: objects.id })

    objectId = object?.id ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function insertTicket(input: {
    status: string
    priority: string
    reportedAt: Date
    deadlineAt: Date
    acknowledgedAt?: Date | null
  }) {
    const inserted = await db
      .insert(tickets)
      .values({
        objectId,
        ...input,
        receivedAt: input.reportedAt,
        faultTemplateKeys: [],
      })
      .returning({ ticketNo: tickets.ticketNo, status: tickets.status })

    const ticket = inserted[0]

    if (ticket === undefined) {
      throw new Error('the ticket was not inserted')
    }

    return ticket
  }

  it('adds timelineState, percent and remainingMs to every list item', async () => {
    const reportedAt = new Date('2026-11-05T08:00:00.000Z')

    await insertTicket({
      status: 'NEW',
      priority: 'normal',
      reportedAt,
      deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
    })

    await insertTicket({
      status: 'ACKNOWLEDGED',
      priority: 'critical',
      reportedAt: new Date('2026-11-05T07:00:00.000Z'),
      deadlineAt: new Date('2026-11-05T10:00:00.000Z'),
      acknowledgedAt: new Date('2026-11-05T07:30:00.000Z'),
    })

    const result = await listTickets(db, {
      open: undefined,
      overdue: undefined,
      order: 'reportedAt',
      direction: 'desc',
      limit: 25,
      offset: 0,
    })

    expect(result.tickets).toHaveLength(2)

    for (const item of result.tickets) {
      expect(item.timelineState).toMatch(/^(green|yellow|orange|red|stopped)$/)
      expect(item.percent).toBeGreaterThanOrEqual(0)
      expect(item.percent).toBeLessThanOrEqual(100)
      expect(item.remainingMs).toBeGreaterThanOrEqual(0)
    }

    const stopped = result.tickets.find((item) => item.status === 'ACKNOWLEDGED')
    expect(stopped?.timelineState).toBe('stopped')
  })

  it('orders the deadline list with the open tickets first and the nearest deadline on top', async () => {
    const far = await insertTicket({
      status: 'NEW',
      priority: 'normal',
      reportedAt: new Date('2026-11-05T08:00:00.000Z'),
      deadlineAt: new Date('2026-11-20T08:00:00.000Z'),
    })

    const near = await insertTicket({
      status: 'IN_REVIEW',
      priority: 'normal',
      reportedAt: new Date('2026-11-09T08:00:00.000Z'),
      deadlineAt: new Date('2026-11-10T08:00:00.000Z'),
    })

    const closed = await insertTicket({
      status: 'CLOSED',
      priority: 'normal',
      reportedAt: new Date('2026-10-01T08:00:00.000Z'),
      deadlineAt: new Date('2026-10-04T08:00:00.000Z'),
    })

    const result = await listTickets(db, {
      open: undefined,
      overdue: undefined,
      order: 'deadlineAt',
      direction: 'asc',
      limit: 25,
      offset: 0,
    })

    const numbers = result.tickets.map((item) => item.ticketNo)

    expect(numbers.indexOf(near.ticketNo)).toBeGreaterThanOrEqual(0)
    expect(numbers.indexOf(near.ticketNo)).toBeLessThan(numbers.indexOf(far.ticketNo))
    expect(numbers.indexOf(far.ticketNo)).toBeLessThan(numbers.indexOf(closed.ticketNo))
  })
})
