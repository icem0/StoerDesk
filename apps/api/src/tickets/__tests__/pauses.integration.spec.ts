import { randomUUID } from 'node:crypto'

import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { PauseError, endTicketPause, startTicketPause } from '../pauses'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped pause service integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPauses, tickets, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')('pause service (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let actorUserId = ''
  let ticketNo = ''
  let acknowledgedTicketNo = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [user] = await db
      .insert(users)
      .values({ email: `pause-${randomUUID()}@example.invalid`, passwordHash: 'unused' })
      .returning({ id: users.id })
    actorUserId = user?.id ?? ''

    const [object] = await db
      .insert(objects)
      .values({ objectNo: `P-${randomUUID().slice(0, 6)}`, name: 'Pause service probe' })
      .returning({ id: objects.id })

    const now = new Date()
    const [ticket] = await db
      .insert(tickets)
      .values({
        objectId: object?.id ?? '',
        status: 'IN_REVIEW',
        reportedAt: now,
        deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
      })
      .returning({ ticketNo: tickets.ticketNo })
    ticketNo = ticket?.ticketNo ?? ''

    const [acknowledged] = await db
      .insert(tickets)
      .values({
        objectId: object?.id ?? '',
        status: 'ACKNOWLEDGED',
        reportedAt: now,
        deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        acknowledgedAt: now,
      })
      .returning({ ticketNo: tickets.ticketNo })
    acknowledgedTicketNo = acknowledged?.ticketNo ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('starts and ends a pause with one event each', async () => {
    const started = await startTicketPause(db, {
      ticketNo,
      actorUserId,
      reason: 'waiting for a spare part',
    })

    expect(started.pause.endedAt).toBeNull()

    await expect(
      startTicketPause(db, { ticketNo, actorUserId, reason: 'second pause' }),
    ).rejects.toMatchObject({ code: 'pause_already_open', statusCode: 409 })

    const ended = await endTicketPause(db, { ticketNo, actorUserId })

    expect(ended.pause.endedAt).not.toBeNull()

    await expect(endTicketPause(db, { ticketNo, actorUserId })).rejects.toMatchObject({
      code: 'pause_not_open',
      statusCode: 409,
    })

    const events = await db
      .select({ type: ticketEvents.type })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, started.pause.ticketId))
      .orderBy(asc(ticketEvents.createdAt))

    expect(events.map((event) => event.type)).toEqual(['paused', 'resumed'])

    const pauses = await db
      .select({ id: ticketPauses.id })
      .from(ticketPauses)
      .where(eq(ticketPauses.ticketId, started.pause.ticketId))

    expect(pauses).toHaveLength(1)
  })

  it('rejects a pause on an acknowledged ticket', async () => {
    await expect(
      startTicketPause(db, {
        ticketNo: acknowledgedTicketNo,
        actorUserId,
        reason: 'too late',
      }),
    ).rejects.toBeInstanceOf(PauseError)

    await expect(
      startTicketPause(db, {
        ticketNo: acknowledgedTicketNo,
        actorUserId,
        reason: 'too late',
      }),
    ).rejects.toMatchObject({ code: 'ticket_not_pausable', statusCode: 409 })
  })
})
