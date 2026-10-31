import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { objects, systems, ticketEvents, ticketPhotos, tickets } from '../schema'
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

/** Drizzle wraps driver errors, so the Postgres error may sit in `cause`. */
function causeOf(error: unknown): unknown {
  return error instanceof PostgresError ? error : (error as { cause?: unknown }).cause
}

async function expectPgError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const pgError = causeOf(error)

    expect(pgError).toBeInstanceOf(PostgresError)
    expect((pgError as PostgresError).code).toBe(code)

    return
  }

  throw new Error(`expected postgres error ${code}`)
}

describe.skipIf(testDatabase.status === 'unavailable')('ticket tables (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 8 })
  const db = drizzle(client, {
    schema: { objects, systems, tickets, ticketEvents, ticketPhotos },
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

  async function newObject(): Promise<string> {
    const [object] = await db
      .insert(objects)
      .values({ objectNo: `9${randomUUID().slice(0, 5)}_01`, name: `Objekt ${randomUUID()}` })
      .returning({ id: objects.id })

    return onlyRow(object ? [object] : [], 'object').id
  }

  async function newTicket(objectId: string, values: Record<string, unknown> = {}) {
    const now = new Date()

    return onlyRow(
      await db
        .insert(tickets)
        .values({
          objectId,
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
          ...values,
        })
        .returning(),
      'ticket',
    )
  }

  it('creates the ticket tables of migration 0004', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('tickets', 'ticket_events', 'ticket_photos', 'ticket_no_counters')
      order by table_name`

    expect(rows.map((row) => row.table_name)).toEqual([
      'ticket_events',
      'ticket_no_counters',
      'ticket_photos',
      'tickets',
    ])
  })

  it('allocates distinct ST-<year>-NNNN numbers under concurrent inserts', async () => {
    const objectId = await newObject()

    const created = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const ticket = await newTicket(objectId)

        return ticket.ticketNo
      }),
    )

    const year = new Date().getFullYear()

    expect(created).toHaveLength(5)
    expect(new Set(created).size).toBe(5)

    for (const ticketNo of created) {
      expect(ticketNo).toMatch(new RegExp(`^ST-${year}-\\d{4}$`))
    }
  })

  it('rejects a duplicate client_uuid and unknown enum values', async () => {
    const objectId = await newObject()
    const clientUuid = randomUUID()

    await newTicket(objectId, { clientUuid })

    await expectPgError('23505', () => newTicket(objectId, { clientUuid }))
    await expectPgError('23514', () => newTicket(objectId, { status: 'DONE' }))
    await expectPgError('23514', () => newTicket(objectId, { priority: 'urgent' }))
    await expectPgError('23514', () => newTicket(objectId, { source: 'PHONE' }))
  })

  it('blocks updates and deletes on ticket_events', async () => {
    const objectId = await newObject()
    const ticket = await newTicket(objectId)

    const event = onlyRow(
      await db
        .insert(ticketEvents)
        .values({ ticketId: ticket.id, type: 'created', actorKind: 'public' })
        .returning({ id: ticketEvents.id, type: ticketEvents.type }),
      'event',
    )

    await expectPgError('P0001', () =>
      client`update ticket_events set type = 'tampered' where id = ${event.id}`,
    )
    await expectPgError('P0001', () =>
      client`delete from ticket_events where id = ${event.id}`,
    )

    try {
      await client`update ticket_events set type = 'tampered' where id = ${event.id}`
    } catch (error) {
      expect(String(causeOf(error))).toContain('ticket_event_append_only')
    }

    const kept = await db
      .select({ type: ticketEvents.type })
      .from(ticketEvents)
      .where(eq(ticketEvents.id, event.id))

    expect(kept).toEqual([{ type: 'created' }])
  })

  it('refuses to hard-delete an object with tickets and clears a deleted system', async () => {
    const objectId = await newObject()
    const system = onlyRow(
      await db
        .insert(systems)
        .values({ objectId, type: 'BMA', label: 'Brandmeldeanlage' })
        .returning({ id: systems.id }),
      'system',
    )
    const ticket = await newTicket(objectId, { systemId: system.id })

    await expectPgError('23503', () => db.delete(objects).where(eq(objects.id, objectId)))

    await db.delete(systems).where(eq(systems.id, system.id))

    const afterSystemDelete = await db
      .select({ systemId: tickets.systemId })
      .from(tickets)
      .where(eq(tickets.id, ticket.id))

    expect(afterSystemDelete).toEqual([{ systemId: null }])
  })

  it('cascades events and photos when a ticket is removed', async () => {
    const objectId = await newObject()
    const ticket = await newTicket(objectId)

    await db.insert(ticketEvents).values({
      ticketId: ticket.id,
      type: 'created',
      actorKind: 'public',
      payload: { source: 'integration' },
    })
    await db.insert(ticketPhotos).values({
      ticketId: ticket.id,
      filePath: `tickets/${ticket.id}/photo-${randomUUID()}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    })

    await expectPgError('23514', () =>
      db.insert(ticketPhotos).values({
        ticketId: ticket.id,
        filePath: `tickets/${ticket.id}/notes-${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 512,
      }),
    )

    await db.delete(tickets).where(eq(tickets.id, ticket.id))

    const remainingEvents = await db
      .select({ id: ticketEvents.id })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticket.id))
    const remainingPhotos = await db
      .select({ id: ticketPhotos.id })
      .from(ticketPhotos)
      .where(eq(ticketPhotos.ticketId, ticket.id))

    expect(remainingEvents).toHaveLength(0)
    expect(remainingPhotos).toHaveLength(0)
  })
})
