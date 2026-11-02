import { and, count, eq, type SQL, gte } from 'drizzle-orm'

import type { Database } from '../db/client'
import { reportThrottle } from '../db/schema'

/**
 * Report throttle of the public report endpoint (`specs/06-report-form.md` §7.6,
 * WP-M2-07). "Suspicious" is more than three reports per ten minutes per IP **or**
 * per QR token (`PLAN.md` §10). The stack has no cache and no Redis (`PLAN.md` §4),
 * so the window is counted over the append-only `report_throttle` rows — the only
 * store every API instance shares.
 *
 * This module only detects. The honeypot, the Altcha proof of work and the write of
 * `tickets.suspected_spam` are WP-M2-07b/07c on the create path.
 */

type Db = Database['database']

/** §7.6: the fourth report inside the window is the one that tips over. */
export const SUSPICION_MAX = 3

/** §7.6: every count is measured over this window. */
export const SUSPICION_WINDOW_MS = 10 * 60 * 1000

/** Both dimensions §7.6 asks for: the request IP and the QR token it used. */
export type ReportAttempt = { ip: string; qrToken: string }

/** One attempt, recorded before the report itself is decided (WP-M2-07c). */
export async function recordReportAttempt(database: Db, attempt: ReportAttempt): Promise<void> {
  await database.insert(reportThrottle).values({ ip: attempt.ip, qrToken: attempt.qrToken })
}

async function countAttempts(database: Db, dimension: SQL, since: Date): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(reportThrottle)
    .where(and(gte(reportThrottle.createdAt, since), dimension))

  return Number(row?.total ?? 0)
}

/**
 * The higher of the two window counts: an attacker may rotate QR tokens over one IP
 * or spread one token over many IPs, and either one has to be caught (§7.6).
 */
export async function recentReportCount(
  database: Db,
  attempt: ReportAttempt,
  windowMs = SUSPICION_WINDOW_MS,
): Promise<number> {
  const since = new Date(Date.now() - windowMs)
  const perIp = await countAttempts(database, eq(reportThrottle.ip, attempt.ip), since)
  const perToken = await countAttempts(database, eq(reportThrottle.qrToken, attempt.qrToken), since)

  return Math.max(perIp, perToken)
}

/** §7.6: more attempts than `SUSPICION_MAX` inside `SUSPICION_WINDOW_MS`. */
export async function isReportSuspicious(database: Db, attempt: ReportAttempt): Promise<boolean> {
  return (await recentReportCount(database, attempt)) > SUSPICION_MAX
}
