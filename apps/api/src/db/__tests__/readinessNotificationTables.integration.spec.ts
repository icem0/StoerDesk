import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped readiness notification tables integration: ${testDatabase.reason}\n`)
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
  'the readiness widening of the outbox (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })

    let ticketId = ''
    let shiftId = ''
    let userId = ''

    beforeAll(async () => {
      await migrate(drizzle(client), { migrationsFolder })

      const objectRows = await client<{ id: string }[]>`
        insert into "objects" ("object_no", "name")
        values (${`READY-${randomUUID().slice(0, 6)}`}, 'Readiness probe')
        returning "id"`
      const object = onlyRow(objectRows, 'object')

      const ticketRows = await client<{ id: string }[]>`
        insert into "tickets" ("object_id", "reported_at", "deadline_at")
        values (${object.id}, now(), now() + interval '1 hour')
        returning "id"`
      const ticket = onlyRow(ticketRows, 'ticket')

      const poolRows = await client<{ id: string }[]>`
        insert into "oncall_pools" ("name", "active")
        values (${`Pool ${randomUUID().slice(0, 6)}`}, true)
        returning "id"`
      const pool = onlyRow(poolRows, 'pool')

      const shiftRows = await client<{ id: string }[]>`
        insert into "oncall_shifts" ("pool_id", "state", "starts_at", "ends_at")
        values (${pool.id}, 'UNFILLED', '2026-03-23T06:00:00Z', '2026-03-30T05:00:00Z')
        returning "id"`
      const shift = onlyRow(shiftRows, 'shift')

      const userRows = await client<{ id: string }[]>`
        insert into "users" ("email", "password_hash", "given_name", "family_name")
        values (${`ready-${randomUUID().slice(0, 6)}@example.invalid`}, 'x', 'Ready', 'User')
        returning "id"`
      const user = onlyRow(userRows, 'user')

      ticketId = ticket.id
      shiftId = shift.id
      userId = user.id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('accepts a ticket row and defaults its event type to ticket.created', async () => {
      const [row] = await client<{ event_type: string }[]>`
        insert into "outbox" ("ticket_id", "channel")
        values (${ticketId}, 'ntfy')
        returning "event_type"`

      expect(row?.event_type).toBe('ticket.created')
    })

    it('accepts a shift row with a readiness event type', async () => {
      const [row] = await client<{ event_type: string }[]>`
        insert into "outbox" ("shift_id", "channel", "event_type")
        values (${shiftId}, 'ntfy', 'oncall.assigned')
        returning "event_type"`

      expect(row?.event_type).toBe('oncall.assigned')
    })

    it('refuses a row with both a ticket and a shift and one with neither', async () => {
      await expectPgError(
        '23514',
        () =>
          client`
            insert into "outbox" ("ticket_id", "shift_id", "channel")
            values (${ticketId}, ${shiftId}, 'ntfy')`,
      )

      await expectPgError(
        '23514',
        () => client`insert into "outbox" ("channel") values ('ntfy')`,
      )
    })

    it('accepts a confirmed account of a user for the readiness events', async () => {
      await client`
        insert into "notification_accounts" ("user_id", "channel", "external_id", "verified_at")
        values (${userId}, 'ntfy', 'stoerdesk-readiness', now())`

      const [row] = await client<{ verified_at: Date }[]>`
        select "verified_at" from "notification_accounts"
        where "user_id" = ${userId} and "channel" = 'ntfy'`

      expect(row?.verified_at).toBeTruthy()
    })
  },
)
