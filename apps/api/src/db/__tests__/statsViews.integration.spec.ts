import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { objects, ticketPauses, tickets } from '../schema'
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

describe.skipIf(testDatabase.status === 'unavailable')('statistics views (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 8 })
  const db = drizzle(client, {
    schema: { objects, tickets, ticketPauses },
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

  it('answers stats_tickets and stats_ticket_faults with summed pause seconds', async () => {
    const object = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `9${randomUUID().slice(0, 5)}_01`, name: `Objekt ${randomUUID()}` })
        .returning({ id: objects.id }),
      'object',
    )

    const now = new Date()
    const startedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const endedAt = new Date(now.getTime() - 60 * 60 * 1000)

    const ticket = onlyRow(
      await db
        .insert(tickets)
        .values({
          objectId: object.id,
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
          faultTemplateKeys: ['BMA_STOERUNG', 'RWA_AUSLOESE'],
        })
        .returning(),
      'ticket',
    )

    await db.insert(ticketPauses).values({
      ticketId: ticket.id,
      reason: 'Warte auf Ersatzteil',
      startedAt,
      endedAt,
    })

    const ticketRows = await client<{ ticket_no: string; pause_seconds: unknown }[]>`
      select ticket_no, pause_seconds
      from "stats_tickets"
      where "ticket_no" = ${ticket.ticketNo}`

    expect(ticketRows).toHaveLength(1)
    expect(Number(ticketRows[0]?.pause_seconds)).toBe(3600)

    const faultRows = await client<{ fault_template_key: string }[]>`
      select fault_template_key
      from "stats_ticket_faults"
      where "ticket_id" = ${ticket.id}
      order by fault_template_key`

    expect(faultRows.map((row) => row.fault_template_key)).toEqual([
      'BMA_STOERUNG',
      'RWA_AUSLOESE',
    ])
  })
})
