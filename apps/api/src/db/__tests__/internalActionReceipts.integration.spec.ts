import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  internalActionReceipts,
  tickets,
  ticketEvents,
} from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

function causeOf(error: unknown): unknown {
  return error instanceof PostgresError ? error : (error as { cause?: unknown }).cause
}

describe.skipIf(testDatabase.status === 'unavailable')('internal_action_receipts (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, {
    schema: { internalActionReceipts, tickets, ticketEvents },
  })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('creates the table of migration 0013', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'internal_action_receipts'`

    expect(rows.map((row) => row.table_name)).toEqual(['internal_action_receipts'])
  })

  it('inserts one receipt and returns uuid v7 id, client_uuid and timestamps', async () => {
    const ticket = onlyRow(
      await db.insert(tickets).values({
        objectId: '00000000-0000-0000-0000-000000000000',
        reportedAt: new Date(),
        deadlineAt: new Date(Date.now() + 86400000),
      }).returning(),
      'ticket',
    )

    const event = onlyRow(
      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'acknowledged',
        actorKind: 'user',
        actorUserId: null,
        payload: {},
      }).returning(),
      'event',
    )

    const receipt = onlyRow(
      await db.insert(internalActionReceipts).values({
        clientUuid: 'receipt-1',
        ticketId: ticket.id,
        actorUserId: null,
        action: 'acknowledge',
        eventId: event.id,
      }).returning(),
      'receipt',
    )

    expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(receipt.clientUuid).toBe('receipt-1')
    expect(receipt.ticketId).toBe(ticket.id)
    expect(receipt.actorUserId).toBeNull()
    expect(receipt.action).toBe('acknowledge')
    expect(receipt.eventId).toBe(event.id)
    expect(receipt.createdAt).toBeInstanceOf(Date)
  })

  it('rejects a second insert with the same client_uuid (unique)', async () => {
    const ticket = onlyRow(
      await db.insert(tickets).values({
        objectId: '00000000-0000-0000-0000-000000000001',
        reportedAt: new Date(),
        deadlineAt: new Date(Date.now() + 86400000),
      }).returning(),
      'ticket',
    )

    const event = onlyRow(
      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'acknowledged',
        actorKind: 'user',
        actorUserId: null,
        payload: {},
      }).returning(),
      'event',
    )

    await db.insert(internalActionReceipts).values({
      clientUuid: 'receipt-dup',
      ticketId: ticket.id,
      actorUserId: null,
      action: 'acknowledge',
      eventId: event.id,
    })

    try {
      await db.insert(internalActionReceipts).values({
        clientUuid: 'receipt-dup',
        ticketId: ticket.id,
        actorUserId: null,
        action: 'acknowledge',
        eventId: event.id,
      })
    } catch (error) {
      const pgError = causeOf(error)

      expect(pgError).toBeInstanceOf(PostgresError)
      expect((pgError as PostgresError).code).toBe('23505')

      return
    }

    throw new Error('expected postgres error 23505')
  })

  it('cascades delete with the ticket', async () => {
    const ticket = onlyRow(
      await db.insert(tickets).values({
        objectId: '00000000-0000-0000-0000-000000000002',
        reportedAt: new Date(),
        deadlineAt: new Date(Date.now() + 86400000),
      }).returning(),
      'ticket',
    )

    const event = onlyRow(
      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'acknowledged',
        actorKind: 'user',
        actorUserId: null,
        payload: {},
      }).returning(),
      'event',
    )

    await db.insert(internalActionReceipts).values({
      clientUuid: 'receipt-cascade',
      ticketId: ticket.id,
      actorUserId: null,
      action: 'acknowledge',
      eventId: event.id,
    })

    await db.delete(tickets).where(eq(tickets.id, ticket.id))

    const remaining = await db
      .select()
      .from(internalActionReceipts)
      .where(eq(internalActionReceipts.clientUuid, 'receipt-cascade'))

    expect(remaining).toEqual([])
  })
})
