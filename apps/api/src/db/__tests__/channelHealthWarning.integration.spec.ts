import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped channel health warning migration integration: ${testDatabase.reason}\n`)
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

describe.skipIf(testDatabase.status === 'unavailable')(
  'the instance row of the channel health warning (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })

    let ticketId = ''
    let shiftId = ''

    beforeAll(async () => {
      await migrate(drizzle(client), { migrationsFolder })

      const objectRows = await client<{ id: string }[]>`
        insert into "objects" ("object_no", "name")
        values (${`HEALTH-${randomUUID().slice(0, 6)}`}, 'Health probe')
        returning "id"`
      const object = onlyRow(objectRows, 'object')

      const ticketRows = await client<{ id: string }[]>`
        insert into "tickets" ("object_id", "reported_at", "deadline_at")
        values (${object.id}, now(), now() + interval '1 hour')
        returning "id"`

      ticketId = onlyRow(ticketRows, 'ticket').id

      const poolRows = await client<{ id: string }[]>`
        insert into "oncall_pools" ("name", "active")
        values (${`Pool ${randomUUID().slice(0, 6)}`}, true)
        returning "id"`
      const pool = onlyRow(poolRows, 'pool')

      const shiftRows = await client<{ id: string }[]>`
        insert into "oncall_shifts" ("pool_id", "state", "starts_at", "ends_at")
        values (${pool.id}, 'UNFILLED', '2026-03-23T06:00:00Z', '2026-03-30T05:00:00Z')
        returning "id"`

      shiftId = onlyRow(shiftRows, 'shift').id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('accepts a warning row without a ticket and without a shift', async () => {
      const [row] = await client<{ event_type: string }[]>`
        insert into "outbox" ("channel", "event_type")
        values ('ntfy', 'channel.health_warning')
        returning "event_type"`

      expect(row?.event_type).toBe('channel.health_warning')
    })

    it('refuses an unknown event type', async () => {
      await expectPgError(
        '23514',
        () =>
          client`
            insert into "outbox" ("channel", "event_type")
            values ('ntfy', 'channel.telepathy')`,
      )
    })

    it('refuses a ticket row without a ticket and without a shift', async () => {
      await expectPgError(
        '23514',
        () => client`insert into "outbox" ("channel") values ('ntfy')`,
      )
    })

    it('still refuses a row with both a ticket and a shift', async () => {
      await expectPgError(
        '23514',
        () =>
          client`
            insert into "outbox" ("ticket_id", "shift_id", "channel", "event_type")
            values (${ticketId}, ${shiftId}, 'ntfy', 'channel.health_warning')`,
      )
    })
  },
)
