import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, describe, expect, it, inject } from 'vitest'

import {
  claimTestDatabase,
  emptyTestDatabase,
  TEST_DATABASE_POOL_KEY,
} from './helpers/testDatabasePool'
import { openTestDatabase } from './helpers/testDatabase'
import * as schema from '../schema'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped the pool of the test databases: ${testDatabase.reason}\n`)
}

const { objects } = schema

/**
 * The pool of the throwaway databases (WP-M28-02): every test file claims a
 * database that is migrated and empty, and gives it back when it is done. The
 * rows the migrations wrote — the reserved object without an object — stay.
 */
describe.skipIf(testDatabase.status === 'unavailable')(
  'the pool of the test databases (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('hands out a database with the schema of the migrations', async () => {
      const rows = await client<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public' and table_name = 'tickets'
      `

      expect(rows.map((row) => row.table_name)).toEqual(['tickets'])
    })

    it('keeps the rows the migrations wrote', async () => {
      const reserved = await db
        .select({ objectNo: objects.objectNo, priority: schema.objectPriorityOverrides.priority })
        .from(objects)
        .leftJoin(
          schema.objectPriorityOverrides,
          eq(schema.objectPriorityOverrides.objectId, objects.id),
        )

      expect(reserved).toEqual([{ objectNo: 'OHNE-OBJEKT', priority: 'low' }])
    })

    it('empties the database for the next file', async () => {
      const pool = inject(TEST_DATABASE_POOL_KEY)

      expect(pool.status).toBe('available')

      if (pool.status !== 'available') {
        return
      }

      const claim = await claimTestDatabase(pool)
      const claimClient = postgres(claim.url, { max: 2 })
      const claimDb = drizzle(claimClient, { schema })

      try {
        await claimDb.insert(objects).values({ objectNo: 'POOL-01', name: 'Pool' })

        const before = await claimDb.select({ objectNo: objects.objectNo }).from(objects)

        expect(before.map((row) => row.objectNo)).toContain('POOL-01')

        await emptyTestDatabase(claimClient, pool)

        const after = await claimDb.select({ objectNo: objects.objectNo }).from(objects)

        expect(after.map((row) => row.objectNo)).not.toContain('POOL-01')
        expect(after.map((row) => row.objectNo)).toContain('OHNE-OBJEKT')
      } finally {
        await claimClient.end({ timeout: 2 })
        await claim.release()
      }
    })
  },
)
