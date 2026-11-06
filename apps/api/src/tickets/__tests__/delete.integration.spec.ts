import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { deleteTicket } from '../delete'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket delete integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPurges, tickets, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')('ticket delete (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''
  let actorUserId = ''
  let ticketNo = ''
  let ticketId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [object] = await db
      .insert(objects)
      .values({ objectNo: `DL-${randomUUID().slice(0, 6)}`, name: 'Delete probe' })
      .returning({ id: objects.id })
    objectId = object?.id ?? ''

    const [user] = await db
      .insert(users)
      .values({
        email: `delete-admin-${randomUUID().slice(0, 6)}@example.org`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
        givenName: 'Delete',
        familyName: 'Admin',
      })
      .returning({ id: users.id })
    actorUserId = user?.id ?? ''

    const [ticket] = await db
      .insert(tickets)
      .values({
        objectId,
        ticketNo: `ST-2026-${randomUUID().slice(0, 4).toUpperCase()}`,
        status: 'CANCELLED',
        priority: 'normal',
        reportedAt: new Date('2026-11-05T08:00:00.000Z'),
        receivedAt: new Date('2026-11-05T08:00:00.000Z'),
        deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
        faultTemplateKeys: [],
      })
      .returning({ id: tickets.id, ticketNo: tickets.ticketNo })
    ticketId = ticket?.id ?? ''
    ticketNo = ticket?.ticketNo ?? ''

    await db.insert(ticketEvents).values({
      ticketId,
      type: 'created',
      actorKind: 'system',
      actorUserId: null,
      payload: { source: 'QR' },
      createdAt: new Date('2026-11-05T08:00:00.000Z'),
    })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('deletes a cancelled ticket and writes a purge log', async () => {
    const result = await deleteTicket({
      database: db,
      uploadDir: '/tmp/opencode/uploads',
      ticketNo,
      actorUserId,
      reason: 'test deletion',
    })

    expect(result.ticketNo).toBe(ticketNo)
    expect(result.deletedEventsCount).toBeGreaterThanOrEqual(0)

    const remaining = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
    expect(remaining).toHaveLength(0)

    const purges = await db
      .select()
      .from(ticketPurges)
      .where(eq(ticketPurges.ticketNo, ticketNo))
    expect(purges).toHaveLength(1)
    expect(purges[0]?.actorUserId).toBe(actorUserId)
  })

  it('returns 409 for a non-cancelled ticket', async () => {
    const [openTicket] = await db
      .insert(tickets)
      .values({
        objectId,
        ticketNo: `ST-2026-${randomUUID().slice(0, 4).toUpperCase()}`,
        status: 'NEW',
        priority: 'normal',
        reportedAt: new Date('2026-11-05T08:00:00.000Z'),
        receivedAt: new Date('2026-11-05T08:00:00.000Z'),
        deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
        faultTemplateKeys: [],
      })
      .returning({ ticketNo: tickets.ticketNo })

    await expect(
      deleteTicket({
        database: db,
        uploadDir: '/tmp/opencode/uploads',
        ticketNo: openTicket?.ticketNo ?? '',
        actorUserId,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ticket_not_cancelled' })
  })

  it('returns 404 for a missing ticket', async () => {
    await expect(
      deleteTicket({
        database: db,
        uploadDir: '/tmp/opencode/uploads',
        ticketNo: 'ST-9999-9999',
        actorUserId,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ticket_not_found' })
  })
})
