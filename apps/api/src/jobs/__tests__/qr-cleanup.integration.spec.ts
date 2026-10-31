import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { deleteExpiredQrTokens, QR_TOKEN_CLEANUP_CRON, QR_TOKEN_CLEANUP_QUEUE } from '../qr-cleanup'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped qr token cleanup integration: ${testDatabase.reason}\n`)
}

const DAY_MS = 24 * 60 * 60 * 1000

const { objects, oldQrTokens } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'qr token cleanup — deleteExpiredQrTokens (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let objectId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const inserted = await db
        .insert(objects)
        .values({ objectNo: '9900_01', name: 'retired token probe' })
        .returning({ id: objects.id })

      objectId = onlyRow(inserted, 'object').id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('deletes expired and due rows and keeps the future one', async () => {
      const now = new Date()

      const inserted = await db
        .insert(oldQrTokens)
        .values([
          {
            objectId,
            token: 'expired_token_row_a1xx',
            expiresAt: new Date(now.getTime() - DAY_MS),
          },
          { objectId, token: 'expired_token_row_b2xx', expiresAt: now },
          {
            objectId,
            token: 'future_token_row_c3xxx',
            expiresAt: new Date(now.getTime() + DAY_MS),
          },
        ])
        .returning({ id: oldQrTokens.id })

      expect(inserted).toHaveLength(3)

      expect(await deleteExpiredQrTokens(db, now)).toBe(2)

      const remaining = await db.select({ token: oldQrTokens.token }).from(oldQrTokens)

      expect(remaining.map((row) => row.token)).toEqual(['future_token_row_c3xxx'])

      // Idempotent: a second run of the same day finds nothing left to delete.
      expect(await deleteExpiredQrTokens(db, now)).toBe(0)
    })

    it('counts only the rows that are due at the passed point in time', async () => {
      const now = new Date()

      await db.delete(oldQrTokens)

      await db.insert(oldQrTokens).values({
        objectId,
        token: 'future_token_row_d4xxx',
        expiresAt: new Date(now.getTime() + DAY_MS),
      })

      expect(await deleteExpiredQrTokens(db, now)).toBe(0)
      expect(await deleteExpiredQrTokens(db, new Date(now.getTime() + 2 * DAY_MS))).toBe(1)
    })

    it('exposes the queue name and the daily cron of the schedule', () => {
      expect(QR_TOKEN_CLEANUP_QUEUE).toBe('qr-token-cleanup')
      expect(QR_TOKEN_CLEANUP_CRON).toBe('0 3 * * *')
    })
  },
)
