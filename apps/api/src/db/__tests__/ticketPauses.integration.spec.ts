import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket pauses integration: ${testDatabase.reason}\n`)
}

const { objects, ticketPauses, tickets } = schema

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

describe.skipIf(testDatabase.status === 'unavailable')('ticket_pauses (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let ticketId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const object = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `PAUSE-${randomUUID().slice(0, 6)}`, name: 'Pause probe' })
        .returning({ id: objects.id }),
      'object',
    )

    const ticket = onlyRow(
      await db
        .insert(tickets)
        .values({
          objectId: object.id,
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .returning({ id: tickets.id }),
      'ticket',
    )

    ticketId = ticket.id
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('allows only one open pause per ticket', async () => {
    await db.insert(ticketPauses).values({ ticketId, reason: 'waiting for a part' })

    await expect(
      db.insert(ticketPauses).values({ ticketId, reason: 'second open pause' }),
    ).rejects.toSatisfy((error: unknown) => {
      const pgError = causeOf(error)

      return pgError instanceof PostgresError && pgError.code === '23505'
    })

    await db
      .update(ticketPauses)
      .set({ endedAt: new Date() })
      .where(eq(ticketPauses.ticketId, ticketId))

    const [closed] = await db
      .insert(ticketPauses)
      .values({ ticketId, reason: 'after the first pause' })
      .returning({ id: ticketPauses.id })

    expect(closed?.id).toBeDefined()
  })

  it('cascades the pauses with the ticket', async () => {
    await db.delete(tickets).where(eq(tickets.id, ticketId))

    const rows = await db
      .select({ id: ticketPauses.id })
      .from(ticketPauses)
      .where(eq(ticketPauses.ticketId, ticketId))

    expect(rows).toHaveLength(0)
  })
})
