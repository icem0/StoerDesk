import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { transitionTicket } from '../workflow'

/**
 * The workflow columns of `PLAN.md` §7 belong to the transition that sets them
 * (`specs/05-timeline.md` §5.2: the timeline stops at `acknowledged`). This
 * proves the columns are written by `transitionTicket` itself, so the office
 * path and the offline replay agree (WP-M12-02, item 5).
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped workflow column integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')('workflow columns (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let actorUserId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [user] = await db
      .insert(users)
      .values({ email: `workflow-${randomUUID()}@example.invalid`, passwordHash: 'unused' })
      .returning({ id: users.id })
    actorUserId = user?.id ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function openTicket(): Promise<string> {
    const [object] = await db
      .insert(objects)
      .values({ objectNo: `W-${randomUUID().slice(0, 6)}`, name: 'Workflow column probe' })
      .returning({ id: objects.id })
    const now = new Date()
    const [ticket] = await db
      .insert(tickets)
      .values({
        objectId: object?.id ?? '',
        status: 'NEW',
        reportedAt: now,
        deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
      })
      .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

    return `${ticket?.id ?? ''}|${ticket?.ticketNo ?? ''}`
  }

  it('writes the timestamp of every milestone into its column', async () => {
    const [ticketId, ticketNo] = (await openTicket()).split('|')

    await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'review_started', actorUserId })
    await transitionTicket({
      database: db,
      ticketId: ticketId ?? '',
      event: 'work_order_set',
      actorUserId,
      payload: { text: 'AA 4711' },
    })
    await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'assigned', actorUserId })
    await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'accepted', actorUserId })
    await transitionTicket({
      database: db,
      ticketId: ticketId ?? '',
      event: 'acknowledged',
      actorUserId,
      payload: { result: 'fixed' },
    })
    await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'closed', actorUserId })

    const [row] = await db
      .select({
        status: tickets.status,
        reviewStartedAt: tickets.reviewStartedAt,
        reviewedByUserId: tickets.reviewedByUserId,
        workOrderText: tickets.workOrderText,
        acceptedAt: tickets.acceptedAt,
        acknowledgedAt: tickets.acknowledgedAt,
        closedAt: tickets.closedAt,
      })
      .from(tickets)
      .where(eq(tickets.ticketNo, ticketNo ?? ''))
      .limit(1)

    expect(row?.status).toBe('CLOSED')
    expect(row?.reviewStartedAt).toBeInstanceOf(Date)
    expect(row?.reviewedByUserId).toBe(actorUserId)
    expect(row?.workOrderText).toBe('AA 4711')
    expect(row?.acceptedAt).toBeInstanceOf(Date)
    expect(row?.acknowledgedAt).toBeInstanceOf(Date)
    expect(row?.closedAt).toBeInstanceOf(Date)
  })

  it('keeps the acknowledged column empty until the acknowledgement happens', async () => {
    const [ticketId, ticketNo] = (await openTicket()).split('|')

    await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'review_started', actorUserId })

    const [row] = await db
      .select({ acknowledgedAt: tickets.acknowledgedAt, status: tickets.status })
      .from(tickets)
      .where(eq(tickets.ticketNo, ticketNo ?? ''))
      .limit(1)

    expect(row?.status).toBe('IN_REVIEW')
    expect(row?.acknowledgedAt).toBeNull()
  })
})
