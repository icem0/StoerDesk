import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { getTicketDetail } from '../detail'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket detail integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPauses, tickets } = schema

describe.skipIf(testDatabase.status === 'unavailable')('ticket detail (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [object] = await db
      .insert(objects)
      .values({ objectNo: `DT-${randomUUID().slice(0, 6)}`, name: 'Detail probe' })
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
  }): Promise<{ id: string; ticketNo: string }> {
    const [ticket] = await db
      .insert(tickets)
      .values({
        objectId,
        ...input,
        receivedAt: input.reportedAt,
        faultTemplateKeys: [],
      })
      .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

    if (ticket === undefined) {
      throw new Error('ticket insert failed')
    }

    await db.insert(ticketEvents).values({
      ticketId: ticket.id,
      type: 'created',
      actorKind: 'system',
      actorUserId: null,
      payload: { source: 'QR' },
      createdAt: input.reportedAt,
    })

    return ticket
  }

  it('answers the timeline and an empty pause list for a normal ticket', async () => {
    const reportedAt = new Date('2026-11-05T08:00:00.000Z')
    const deadlineAt = new Date('2026-11-08T08:00:00.000Z')
    const { ticketNo } = await insertTicket({
      status: 'NEW',
      priority: 'normal',
      reportedAt,
      deadlineAt,
    })

    const result = await getTicketDetail(db, ticketNo)

    expect(result.timeline.reportedAt).toBe(reportedAt.toISOString())
    expect(result.timeline.deadlineAt).toBe(deadlineAt.toISOString())
    expect(result.timeline.state).toBe('green')
    expect(result.timeline.stoppedAt).toBeNull()
    expect(result.timeline.pause).toBeNull()
    expect(result.pauses).toEqual([])
    expect(result.timeline.markers).toContainEqual({ type: 'created', at: reportedAt.toISOString() })
  })

  it('lists the open pause on the timeline and in pauses', async () => {
    const reportedAt = new Date('2026-11-05T08:00:00.000Z')
    const deadlineAt = new Date('2026-11-08T08:00:00.000Z')
    const { id: ticketId, ticketNo } = await insertTicket({
      status: 'IN_REVIEW',
      priority: 'normal',
      reportedAt,
      deadlineAt,
    })

    await db.insert(ticketPauses).values({
      ticketId,
      reason: 'waiting for a spare part',
      startedAt: reportedAt,
    })

    const result = await getTicketDetail(db, ticketNo)

    expect(result.timeline.pause).toMatchObject({
      reason: 'waiting for a spare part',
      startedAt: reportedAt.toISOString(),
    })
    expect(result.pauses).toHaveLength(1)
    expect(result.pauses[0]!.endedAt).toBeNull()
    expect(result.pauses[0]!.reason).toBe('waiting for a spare part')
  })

  it('reports a stopped timeline after acknowledgement', async () => {
    const reportedAt = new Date('2026-11-05T08:00:00.000Z')
    const acknowledgedAt = new Date('2026-11-05T09:00:00.000Z')
    const { ticketNo } = await insertTicket({
      status: 'ACKNOWLEDGED',
      priority: 'normal',
      reportedAt,
      deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
      acknowledgedAt,
    })

    const result = await getTicketDetail(db, ticketNo)

    expect(result.timeline.state).toBe('stopped')
    expect(result.timeline.stoppedAt).toBe(acknowledgedAt.toISOString())
  })
})
