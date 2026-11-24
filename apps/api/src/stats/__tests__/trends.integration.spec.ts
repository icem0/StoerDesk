import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { objects, tickets } from '../../db/schema'
import type { StatsFilter } from '@stoerdesk/shared'
import { queryTrends } from '../trends'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped statistics trends: ${testDatabase.reason}\n`)
}

function onlyRow<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`expected ${what}`)
  }

  return row
}

/** The report of the first ticket of the set. */
const REPORTED_AT = new Date('2026-03-10T10:00:00Z')

/** Minutes after the report of the first ticket. */
function after(minutes: number): Date {
  return new Date(REPORTED_AT.getTime() + minutes * 60 * 1000)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'statistics trends (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [object] = await db
        .insert(objects)
        .values({
          objectNo: `TREND_${Date.now().toString(36)}`,
          name: 'Trend Objekt',
          externalType: 'BMA',
        })
        .returning({ id: objects.id })
      const objectId = onlyRow(object, 'the inserted object').id

      await db.insert(tickets).values([
        {
          objectId,
          ticketNo: `ST-TREND-1-${Date.now().toString(36)}`,
          status: 'CLOSED',
          priority: 'normal',
          source: 'QR',
          reportedAt: REPORTED_AT,
          receivedAt: REPORTED_AT,
          deadlineAt: after(500),
          reviewStartedAt: after(10),
          acknowledgedAt: after(60),
          closedAt: after(120),
        },
        {
          objectId,
          ticketNo: `ST-TREND-2-${Date.now().toString(36)}`,
          status: 'ACKNOWLEDGED',
          priority: 'normal',
          source: 'QR',
          reportedAt: REPORTED_AT,
          receivedAt: REPORTED_AT,
          deadlineAt: after(500),
          reviewStartedAt: after(20),
          acknowledgedAt: after(80),
          closedAt: after(120),
        },
        // The next day: no acknowledgement, no closing.
        {
          objectId,
          ticketNo: `ST-TREND-3-${Date.now().toString(36)}`,
          status: 'IN_REVIEW',
          priority: 'normal',
          source: 'QR',
          reportedAt: new Date('2026-03-12T08:00:00Z'),
          receivedAt: new Date('2026-03-12T08:00:00Z'),
          deadlineAt: new Date('2026-03-12T12:00:00Z'),
          reviewStartedAt: new Date('2026-03-12T08:30:00Z'),
        },
      ])
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers the averages of every bucket and leaves a gap without a sample', async () => {
      const filter: StatsFilter = { from: '2026-03-10', to: '2026-03-12', bucket: 'day' }

      const result = await queryTrends(db, filter, REPORTED_AT)

      // Three days, no gap: the empty day answers a count of zero.
      expect(result.points).toHaveLength(3)

      const [first, empty, third] = result.points

      // Two tickets of the first day: review 10 and 20 minutes → 15.
      expect(first?.tickets).toBe(2)
      expect(first?.reviewMinutes).toBe(15)
      // Acknowledgement 60 and 80 minutes → 70.
      expect(first?.acknowledgeMinutes).toBe(70)
      // The closing of both tickets: 120 minutes.
      expect(first?.processingMinutes).toBe(120)
      expect(first?.closed).toBe(2)

      // The empty day carries no average at all.
      expect(empty?.tickets).toBe(0)
      expect(empty?.reviewMinutes).toBeNull()
      expect(empty?.acknowledgeMinutes).toBeNull()
      expect(empty?.processingMinutes).toBeNull()
      expect(empty?.closed).toBe(0)

      // The third day: the review took 30 minutes, the rest is open.
      expect(third?.tickets).toBe(1)
      expect(third?.reviewMinutes).toBe(30)
      expect(third?.acknowledgeMinutes).toBeNull()
      expect(third?.processingMinutes).toBeNull()
      expect(third?.closed).toBe(0)
    })

    it('puts the tickets into the bucket of their report', async () => {
      const filter: StatsFilter = { from: '2026-03-10', to: '2026-03-31', bucket: 'month' }

      const result = await queryTrends(db, filter, REPORTED_AT)

      // One month in the range, three tickets in it.
      expect(result.points).toHaveLength(1)
      expect(result.points[0]?.tickets).toBe(3)
      expect(result.points[0]?.reviewMinutes).toBe(20)
    })
  },
)
