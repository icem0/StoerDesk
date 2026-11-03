import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bmaSyncRuns } from '../schema'
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

describe.skipIf(testDatabase.status === 'unavailable')('bma_sync_runs (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema: { bmaSyncRuns } })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('creates the table of migration 0007', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'bma_sync_runs'`

    expect(rows.map((row) => row.table_name)).toEqual(['bma_sync_runs'])
  })

  it('starts a run with RUNNING, zero counters and no conflicts', async () => {
    const run = onlyRow(await db.insert(bmaSyncRuns).values({}).returning(), 'run')

    expect(run.status).toBe('RUNNING')
    expect(run.finishedAt).toBeNull()
    expect(run.total).toBe(0)
    expect(run.created).toBe(0)
    expect(run.updated).toBe(0)
    expect(run.unchanged).toBe(0)
    expect(run.deactivated).toBe(0)
    expect(run.conflicts).toEqual([])
    expect(run.errorCode).toBeNull()
  })

  it('finishes a run and keeps its counters and conflicts', async () => {
    const conflicts = [{ code: 'object_no_taken', objectNo: '10372_01', aid: 'a-1', detail: null }]
    const run = onlyRow(await db.insert(bmaSyncRuns).values({
      status: 'PARTIAL',
      finishedAt: new Date(),
      total: 3,
      created: 1,
      updated: 1,
      unchanged: 0,
      deactivated: 1,
      conflicts,
    }).returning(), 'run')

    const stored = onlyRow(await db.select().from(bmaSyncRuns).where(eq(bmaSyncRuns.id, run.id)), 'run')

    expect(stored.status).toBe('PARTIAL')
    expect(stored.total).toBe(3)
    expect(stored.created).toBe(1)
    expect(stored.updated).toBe(1)
    expect(stored.deactivated).toBe(1)
    expect(stored.conflicts).toEqual(conflicts)
  })

  it('rejects an unknown run status', async () => {
    try {
      await db.insert(bmaSyncRuns).values({ status: 'DONE' })
    } catch (error) {
      const pgError = causeOf(error)

      expect(pgError).toBeInstanceOf(PostgresError)
      expect((pgError as PostgresError).code).toBe('23514')

      return
    }

    throw new Error('expected postgres error 23514')
  })
})
