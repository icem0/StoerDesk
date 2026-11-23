import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { writeAssigneePool } from '../../escalation/assignee-pool'
import { answerAssignment, assignTicket } from '../assignment'
import { transitionTicket } from '../workflow'

/**
 * The assignment of a ticket (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-04): one technician, a status (`offered`, `accepted`, `declined`) and
 * the refusal chain — a refusal passes the ticket to the next member of the
 * assignee pool.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assignment integration: ${testDatabase.reason}\n`)
}

const { notificationAccounts, notificationPreferences, objects, outbox, tickets, users } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('the assignment (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let officeUserId = ''
  let firstTechnicianId = ''
  let secondTechnicianId = ''
  let foreignUserId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const inserted = await db
      .insert(users)
      .values([
        {
          email: `assign-office-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Office',
          familyName: 'Assign',
        },
        {
          email: `assign-first-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'First',
          familyName: 'Technician',
        },
        {
          email: `assign-second-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Second',
          familyName: 'Technician',
        },
        {
          email: `assign-foreign-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Foreign',
          familyName: 'Technician',
        },
      ])
      .returning({ id: users.id })

    officeUserId = onlyRow(inserted.slice(0, 1), 'office user').id
    firstTechnicianId = onlyRow(inserted.slice(1, 2), 'first technician').id
    secondTechnicianId = onlyRow(inserted.slice(2, 3), 'second technician').id
    foreignUserId = onlyRow(inserted.slice(3, 4), 'foreign technician').id

    await writeAssigneePool(db, [firstTechnicianId, secondTechnicianId])
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function openWorkOrderTicket(): Promise<string> {
    const [object] = await db
      .insert(objects)
      .values({ objectNo: `A-${randomUUID().slice(0, 6)}`, name: 'Assignment probe' })
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
      .returning({ id: tickets.id })

    const id = ticket?.id ?? ''
    await transitionTicket({ database: db, ticketId: id, event: 'review_started', actorUserId: officeUserId })
    await transitionTicket({
      database: db,
      ticketId: id,
      event: 'work_order_set',
      actorUserId: officeUserId,
      payload: { text: 'AA 4711' },
    })

    return id
  }

  async function stateOf(ticketId: string) {
    const [row] = await db
      .select({
        assignedUserId: tickets.assignedUserId,
        assignmentStatus: tickets.assignmentStatus,
        assignedByUserId: tickets.assignedByUserId,
        status: tickets.status,
      })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)

    return row
  }

  it('assigns the ticket to one technician and waits for the answer', async () => {
    const ticketId = await openWorkOrderTicket()

    const result = await assignTicket(db, {
      ticketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    expect(result.changed).toBe(true)
    expect(result.assignmentStatus).toBe('offered')
    expect(result.assignedUserId).toBe(firstTechnicianId)
    expect(result.assignedByUserId).toBe(officeUserId)

    const state = await stateOf(ticketId)
    expect(state?.status).toBe('ASSIGNED')
    expect(state?.assignmentStatus).toBe('offered')
    expect(state?.assignedByUserId).toBe(officeUserId)
  })

  it('accepts the assignment as the assigned technician', async () => {
    const ticketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    const result = await answerAssignment(db, {
      ticketId,
      actorUserId: firstTechnicianId,
      answer: 'accepted',
    })

    expect(result.assignmentStatus).toBe('accepted')
    expect(result.assignedUserId).toBe(firstTechnicianId)

    const state = await stateOf(ticketId)
    expect(state?.status).toBe('ACCEPTED')
  })

  it('refuses the answer of a user that is not the assigned technician', async () => {
    const ticketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    await expect(
      answerAssignment(db, { ticketId, actorUserId: foreignUserId, answer: 'accepted' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'not_assignee' })

    const state = await stateOf(ticketId)
    expect(state?.assignmentStatus).toBe('offered')
  })

  it('passes a refusal to the next member of the pool', async () => {
    const ticketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    const result = await answerAssignment(db, {
      ticketId,
      actorUserId: firstTechnicianId,
      answer: 'declined',
    })

    expect(result.assignmentStatus).toBe('offered')
    expect(result.assignedUserId).toBe(secondTechnicianId)

    const state = await stateOf(ticketId)
    expect(state?.assignedUserId).toBe(secondTechnicianId)
    expect(state?.assignmentStatus).toBe('offered')
    expect(state?.assignedByUserId).toBe(officeUserId)
  })

  it('keeps the refusal when the pool has no further member', async () => {
    const ticketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId,
      userId: secondTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    const result = await answerAssignment(db, {
      ticketId,
      actorUserId: secondTechnicianId,
      answer: 'declined',
    })

    expect(result.assignmentStatus).toBe('declined')
    expect(result.assignedUserId).toBe(secondTechnicianId)

    const state = await stateOf(ticketId)
    expect(state?.assignmentStatus).toBe('declined')
  })

  it('notifies the assigner about the answer and nobody without an assigner', async () => {
    await db.insert(notificationAccounts).values({
      userId: officeUserId,
      channel: 'ntfy',
      externalId: `office-topic-${randomUUID().slice(0, 6)}`,
    })
    await db.insert(notificationPreferences).values({
      userId: officeUserId,
      eventType: 'ticket.assignment_answered',
      channel: 'ntfy',
    })

    const ticketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: officeUserId,
    })

    await answerAssignment(db, {
      ticketId,
      actorUserId: firstTechnicianId,
      answer: 'accepted',
    })

    const answered = await db
      .select({ eventType: outbox.eventType })
      .from(outbox)
      .where(eq(outbox.ticketId, ticketId))

    expect(answered.filter((row) => row.eventType === 'ticket.assignment_answered')).toHaveLength(1)

    // A rule-made assignment has no assigner and notifies nobody this way.
    const systemTicketId = await openWorkOrderTicket()
    await assignTicket(db, {
      ticketId: systemTicketId,
      userId: firstTechnicianId,
      acceptance: true,
      assignedBy: null,
    })
    await answerAssignment(db, {
      ticketId: systemTicketId,
      actorUserId: firstTechnicianId,
      answer: 'accepted',
    })

    const systemRows = await db
      .select({ eventType: outbox.eventType })
      .from(outbox)
      .where(eq(outbox.ticketId, systemTicketId))

    expect(systemRows.filter((row) => row.eventType === 'ticket.assignment_answered')).toHaveLength(0)
  })

  it('refuses an assignment to a deactivated technician', async () => {
    const ticketId = await openWorkOrderTicket()

    await db
      .update(users)
      .set({ active: false })
      .where(eq(users.id, foreignUserId))

    await expect(
      assignTicket(db, {
        ticketId,
        userId: foreignUserId,
        acceptance: true,
        assignedBy: officeUserId,
      }),
    ).rejects.toMatchObject({ code: 'assign_user_inactive' })

    await db.update(users).set({ active: true }).where(eq(users.id, foreignUserId))
  })
})
