import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

/**
 * The table of the priority deviations (WP-M14-134a, `specs/02-data-model.md`
 * §4.3.2, ADR-0029): the table holds only the objects whose priority differs
 * from the standard, the row points at the uuid of the object and disappears
 * with it.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped priority deviations migration integration: ${testDatabase.reason}\n`)
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
  'the table of the priority deviations (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })

    let objectId = ''

    beforeAll(async () => {
      await migrate(drizzle(client), { migrationsFolder })

      const objectRows = await client<{ id: string }[]>`
        insert into "objects" ("object_no", "name")
        values (${`PRIO-${randomUUID().slice(0, 6)}`}, 'Priority probe')
        returning "id"`

      objectId = onlyRow(objectRows, 'object').id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('holds one row per object that deviates', async () => {
      const rows = await client<{ object_id: string; priority: string }[]>`
        insert into "object_priority_overrides" ("object_id", "priority")
        values (${objectId}, 'critical')
        returning "object_id", "priority"`

      expect(rows).toHaveLength(1)
      expect(rows[0]?.priority).toBe('critical')
    })

    it('refuses an unknown priority', async () => {
      await expectPgError(
        '23514',
        () =>
          client`
            insert into "object_priority_overrides" ("object_id", "priority")
            values (${objectId}, 'urgent')`,
      )
    })

    it('refuses a row without an object', async () => {
      await expectPgError(
        '23503',
        () =>
          client`
            insert into "object_priority_overrides" ("object_id", "priority")
            values (${randomUUID()}, 'high')`,
      )
    })

    it('removes the row when the object is deleted', async () => {
      await client`delete from "objects" where "id" = ${objectId}`

      const rows = await client<{ count: number }[]>`
        select count(*)::int as count from "object_priority_overrides" where "object_id" = ${objectId}`

      expect(rows[0]?.count).toBe(0)
    })
  },
)
