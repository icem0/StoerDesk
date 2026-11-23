import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { assignTicket } from '../../tickets/assignment'
import { transitionTicket } from '../../tickets/workflow'

/**
 * The manual assignment of the office (`specs/07-escalation.md` §7.14,
 * ADR-0039, WP-M19-05): the office names **one** technician. A deactivated
 * account is nobody, so the assignment is refused and the ticket keeps its
 * status.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assign target integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, users } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('assign target (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let actorUserId = ''
  let memberUserId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const inserted = await db
      .insert(users)
      .values([
        { email: `assign-actor-${randomUUID()}@example.invalid`, passwordHash: 'unused' },
        { email: `assign-member-${randomUUID()}@example.invalid`, passwordHash: 'unused' },
      ])
      .returning({ id: users.id })
    actorUserId = onlyRow(inserted.slice(0, 1), 'actor user').id
    memberUserId = onlyRow(inserted.slice(1, 2), 'member user').id
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function openWorkOrderTicket(): Promise<{ id: string; ticketNo: string }> {
    const [object] = await db
      .insert(objects)
      .values({ objectNo: `A-${randomUUID().slice(0, 6)}`, name: 'Assign target probe' })
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

    const id = ticket?.id ?? ''
    await transitionTicket({ database: db, ticketId: id, event: 'review_started', actorUserId })
    await transitionTicket({
      database: db,
      ticketId: id,
      event: 'work_order_set',
      actorUserId,
      payload: { text: 'AA 4711' },
    })

    return { id, ticketNo: ticket?.ticketNo ?? '' }
  }

  it('assigns the ticket to the chosen technician', async () => {
    const ticket = await openWorkOrderTicket()

    const result = await assignTicket(db, {
      ticketId: ticket.id,
      userId: memberUserId,
      acceptance: true,
      assignedBy: actorUserId,
    })

    expect(result.ticket.status).toBe('ASSIGNED')
    expect(result.assignedUserId).toBe(memberUserId)
    expect(result.assignmentStatus).toBe('offered')
    expect(result.assignedByUserId).toBe(actorUserId)
  })

  it('refuses a deactivated technician and keeps the status', async () => {
    await db.update(users).set({ active: false }).where(eq(users.id, memberUserId))

    const ticket = await openWorkOrderTicket()

    await expect(
      assignTicket(db, {
        ticketId: ticket.id,
        userId: memberUserId,
        acceptance: true,
        assignedBy: actorUserId,
      }),
    ).rejects.toMatchObject({ code: 'assign_user_inactive' })

    const [row] = await db
      .select({ status: tickets.status })
      .from(tickets)
      .where(eq(tickets.id, ticket.id))
      .limit(1)
    expect(row?.status).toBe('WORK_ORDER_CREATED')

    await db.update(users).set({ active: true }).where(eq(users.id, memberUserId))
  })
})
