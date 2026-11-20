import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
import { createInternalTicket } from '../internal'
import { queryFrequency } from '../../stats/frequency'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal-without-object integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'internal ticket creation without an object (ADR-0042)', () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let actorUserId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `internal-without-object-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: schema.users.id })
      actorUserId = user?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function storedTicket(objectInfo?: string) {
      return createInternalTicket(
        db,
        {
          objectId: schema.WITHOUT_OBJECT_OBJECT_ID,
          objectInfo,
          title: undefined,
          description: undefined,
          priority: undefined,
          faultTemplateKeys: [],
        },
        actorUserId,
      )
    }

    it('arrives with priority low and stores the object info', async () => {
      const info = 'Fremdfirma Muster GmbH, Musterweg 1, Kontakt 0123/45678'
      await storedTicket(info)

      const rows = await db
        .select({
          priority: schema.tickets.priority,
          objectInfoText: schema.tickets.objectInfoText,
        })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, schema.WITHOUT_OBJECT_OBJECT_ID))
        .orderBy(schema.tickets.createdAt)

      const last = rows[rows.length - 1]
      expect(last?.priority).toBe('low')
      expect(last?.objectInfoText).toBe(info)
    })

    it('stores no object info when none was given', async () => {
      await storedTicket()

      const rows = await db
        .select({ objectInfoText: schema.tickets.objectInfoText })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, schema.WITHOUT_OBJECT_OBJECT_ID))
        .orderBy(schema.tickets.createdAt)

      const last = rows[rows.length - 1]
      expect(last?.objectInfoText).toBeNull()
    })

    it('counts in the statistics without an object', async () => {
      await storedTicket('Statistics probe')

      const without = await queryFrequency(db, { withoutObject: true })
      const withObject = await queryFrequency(db, { withoutObject: false })

      const totalWithout = without.series.reduce(
        (sum: number, point: { total: number }) => sum + point.total,
        0,
      )
      const totalWith = withObject.series.reduce(
        (sum: number, point: { total: number }) => sum + point.total,
        0,
      )

      expect(totalWithout).toBeGreaterThanOrEqual(1)
      expect(totalWith).toBe(0)
    })
  },
)
