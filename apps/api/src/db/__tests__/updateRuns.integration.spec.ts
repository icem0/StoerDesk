import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { updateRuns } from '../schema'
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

describe.skipIf(testDatabase.status === 'unavailable')('update_runs (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema: { updateRuns } })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('creates the table of migration 0009', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'update_runs'`

    expect(rows.map((row) => row.table_name)).toEqual(['update_runs'])
  })

  it('starts a run with RUNNING and without a result', async () => {
    const run = onlyRow(await db.insert(updateRuns).values({}).returning(), 'run')

    expect(run.status).toBe('RUNNING')
    expect(run.finishedAt).toBeNull()
    expect(run.beforeVersion).toBeNull()
    expect(run.afterVersion).toBeNull()
    expect(run.errorCode).toBeNull()
    expect(run.agentRunId).toBeNull()
  })

  it('finishes a run and keeps the versions and the agent run', async () => {
    const run = onlyRow(
      await db
        .insert(updateRuns)
        .values({
          status: 'SUCCESS',
          finishedAt: new Date(),
          beforeVersion: 'v0.1.79',
          afterVersion: 'v0.1.80',
          agentRunId: 'run-1',
        })
        .returning(),
      'run',
    )

    const stored = onlyRow(
      await db.select().from(updateRuns).where(eq(updateRuns.id, run.id)),
      'run',
    )

    expect(stored.status).toBe('SUCCESS')
    expect(stored.beforeVersion).toBe('v0.1.79')
    expect(stored.afterVersion).toBe('v0.1.80')
    expect(stored.agentRunId).toBe('run-1')
  })

  it('rejects an unknown run status', async () => {
    try {
      await db.insert(updateRuns).values({ status: 'DONE' })
    } catch (error) {
      const pgError = causeOf(error)

      expect(pgError).toBeInstanceOf(PostgresError)
      expect((pgError as PostgresError).code).toBe('23514')

      return
    }

    throw new Error('expected postgres error 23514')
  })
})
