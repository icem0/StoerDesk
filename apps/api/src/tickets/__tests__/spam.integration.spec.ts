import { and, eq, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { reportThrottle } from '../../db/schema'
import {
  SUSPICION_MAX,
  SUSPICION_WINDOW_MS,
  type ReportAttempt,
  isReportSuspicious,
  recentReportCount,
  recordReportAttempt,
} from '../spam'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped spam integration: ${testDatabase.reason}\n`)
}

/** TEST-NET-3 (`RFC 5737`) addresses and a distinct token per test case. */
const attempt = (ip: string, qrToken: string): ReportAttempt => ({ ip, qrToken })

describe.skipIf(testDatabase.status === 'unavailable')('report throttle (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function attemptCount(where: SQL | undefined): Promise<number> {
    return (await db.select().from(reportThrottle).where(where)).length
  }

  it('tips over on the fourth attempt of one IP and one token', async () => {
    const one = attempt('203.0.113.11', 'thr-ip-and-token')

    for (let i = 0; i < SUSPICION_MAX; i += 1) {
      await recordReportAttempt(db, one)
    }

    expect(await recentReportCount(db, one)).toBe(SUSPICION_MAX)
    expect(await isReportSuspicious(db, one)).toBe(false)

    await recordReportAttempt(db, one)

    expect(await recentReportCount(db, one)).toBe(SUSPICION_MAX + 1)
    expect(await isReportSuspicious(db, one)).toBe(true)
    expect(
      await attemptCount(
        and(eq(reportThrottle.ip, one.ip), eq(reportThrottle.qrToken, one.qrToken)),
      ),
    ).toBe(SUSPICION_MAX + 1)
  })

  it('is suspicious per token when the IP changes', async () => {
    const qrToken = 'thr-per-token'
    const last = attempt('203.0.113.24', qrToken)

    for (const ip of ['203.0.113.21', '203.0.113.22', '203.0.113.23']) {
      await recordReportAttempt(db, attempt(ip, qrToken))
    }

    expect(await isReportSuspicious(db, last)).toBe(false)

    await recordReportAttempt(db, last)

    expect(await isReportSuspicious(db, last)).toBe(true)
    expect(await attemptCount(eq(reportThrottle.ip, last.ip))).toBe(1)
  })

  it('is suspicious per IP when the token changes', async () => {
    const ip = '203.0.113.31'

    for (const qrToken of ['thr-per-ip-a', 'thr-per-ip-b', 'thr-per-ip-c']) {
      await recordReportAttempt(db, attempt(ip, qrToken))
    }

    const last = attempt(ip, 'thr-per-ip-d')

    expect(await isReportSuspicious(db, last)).toBe(false)

    await recordReportAttempt(db, last)

    expect(await isReportSuspicious(db, last)).toBe(true)
    expect(await attemptCount(eq(reportThrottle.qrToken, last.qrToken))).toBe(1)
  })

  it('ignores attempts outside the ten minute window', async () => {
    const one = attempt('203.0.113.41', 'thr-window')
    const outside = new Date(Date.now() - SUSPICION_WINDOW_MS - 60_000)

    await db.insert(reportThrottle).values({ ...one, createdAt: outside })

    for (let i = 0; i < SUSPICION_MAX; i += 1) {
      await recordReportAttempt(db, one)
    }

    expect(await recentReportCount(db, one)).toBe(SUSPICION_MAX)
    expect(await isReportSuspicious(db, one)).toBe(false)
    expect(await recentReportCount(db, one, SUSPICION_WINDOW_MS + 120_000)).toBe(SUSPICION_MAX + 1)
  })
})
