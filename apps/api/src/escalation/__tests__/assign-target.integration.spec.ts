import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { transitionTicket } from '../../tickets/workflow'
import { assignTicketByUser } from '../distribution'

/**
 * The manual assignment of the office (§7.14, ADR-0033, WP-M19-02): the target
 * is a user group; its technicians become the assignees of the ticket. A target
 * without an active technician is refused and the ticket keeps its status.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assign target integration: ${testDatabase.reason}\n`)
}

const { groups, objects, ticketAssignees, tickets, userGroups, users } = schema

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
    actorUserId = inserted[0]?.id ?? ''
    memberUserId = inserted[1]?.id ?? ''
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

  it('assigns the ticket to the technicians of the chosen group', async () => {
    const [group] = await db
      .insert(groups)
      .values({ name: `Elektrik ${randomUUID().slice(0, 6)}` })
      .returning({ id: groups.id })
    await db.insert(userGroups).values({ userId: memberUserId, groupId: group?.id ?? '' })

    const ticket = await openWorkOrderTicket()
    const updated = await assignTicketByUser(db, {
      ticketId: ticket.id,
      actorUserId,
      target: { kind: 'group', id: group?.id ?? '' },
    })

    expect(updated.status).toBe('ASSIGNED')

    const assignees = await db
      .select({ userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(eq(ticketAssignees.ticketId, ticket.id))
    expect(assignees.map((row) => row.userId)).toStrictEqual([memberUserId])
  })

  it('refuses a group without a technician and keeps the status', async () => {
    const [group] = await db
      .insert(groups)
      .values({ name: `Leer ${randomUUID().slice(0, 6)}` })
      .returning({ id: groups.id })

    const ticket = await openWorkOrderTicket()

    await expect(
      assignTicketByUser(db, {
        ticketId: ticket.id,
        actorUserId,
        target: { kind: 'group', id: group?.id ?? '' },
      }),
    ).rejects.toMatchObject({ code: 'assign_target_empty' })

    const [row] = await db
      .select({ status: tickets.status })
      .from(tickets)
      .where(eq(tickets.id, ticket.id))
      .limit(1)
    expect(row?.status).toBe('WORK_ORDER_CREATED')
  })
})
