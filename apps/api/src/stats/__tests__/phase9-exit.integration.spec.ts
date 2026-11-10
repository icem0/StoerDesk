import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import {
  REFERENCE_LAST_QUALIFYING_REPORTED_AT,
  REFERENCE_MEDIAN_REVIEW_MINUTES,
  referenceInstant,
  seedStatsReference,
} from '../../db/seed-stats-reference'
import * as schema from '../../db/schema'
import {
  resolveDashboardTiles,
  resolveFaultFreeCounter,
} from '../../dashboard/service'
import { queryReactionTimes } from '../reaction-times'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase 9 exit criterion: ${testDatabase.reason}\n`)
}

const { tickets } = schema

const NOW = new Date('2026-01-10T00:00:00.000Z')

describe.skipIf(testDatabase.status === 'unavailable')('phase 9 exit criterion (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    ;({ objectId } = await seedStatsReference(db))
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('ignores a later test ticket and a later cancelled ticket in the counter', async () => {
    const counter = await resolveFaultFreeCounter(db, NOW)

    expect(counter.since).toBe(REFERENCE_LAST_QUALIFYING_REPORTED_AT)
  })

  it('resets the counter on a new qualifying report', async () => {
    const reportedAt = referenceInstant(8)

    await db.insert(tickets).values({
      clientUuid: '00000000-0000-4000-8000-000000000008',
      objectId,
      status: 'NEW',
      priority: 'normal',
      source: 'QR',
      reportedAt,
      receivedAt: reportedAt,
      deadlineAt: new Date(reportedAt.getTime() + 60 * 60 * 1000),
      isTest: false,
    })

    const counter = await resolveFaultFreeCounter(db, NOW)

    expect(counter.since).toBe(reportedAt.toISOString())
  })

  it('matches the printed reaction-time median of the reference data', async () => {
    const result = await queryReactionTimes(db, { from: '2026-01-01', to: '2026-01-07' })

    expect(result.review.count).toBe(5)
    expect(result.review.medianMinutes).toBe(REFERENCE_MEDIAN_REVIEW_MINUTES)
  })

  it('agrees with the dashboard snapshot on the open and overdue counts', async () => {
    const tiles = await resolveDashboardTiles(db, NOW)

    const rows = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('CLOSED', 'CANCELLED')) AS open,
        COUNT(*) FILTER (
          WHERE status NOT IN ('CLOSED', 'CANCELLED')
            AND deadline_at < ${NOW.toISOString()}::timestamptz
        ) AS overdue
      FROM stats_tickets
    `)) as { open: string; overdue: string }[]

    expect(tiles.open).toBe(Number(rows[0]?.open ?? 0))
    expect(tiles.overdue).toBe(Number(rows[0]?.overdue ?? 0))
  })
})
