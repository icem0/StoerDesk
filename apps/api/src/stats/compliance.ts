import { sql, type SQL } from 'drizzle-orm'

import type { Database } from '../db/client'
import type { StatsFilter } from '@stoerdesk/shared'
import { buildStatsFilter } from './filters'

type Db = Database['database']

/** The deadline-compliance answer of `specs/12-stats.md` §12.5. */
export type Compliance = {
  acknowledged: number
  onTime: number
  late: number
  openOverdue: number
  onTimeRate: number | null
}

/** The decline answer of `specs/12-stats.md` §12.5. */
export type Declines = {
  declineRate: number | null
  topReasons: { reason: string; count: number }[]
}

/** A timestamp as a bound `timestamptz` parameter. */
function timestampParam(instant: Date): SQL {
  return sql`${instant.toISOString()}::timestamptz`
}

type ComplianceRow = {
  acknowledged: number
  on_time: number
  open_overdue: number
}

/**
 * Deadline compliance of the filtered tickets (`specs/12-stats.md` §12.5,
 * WP-M9-11).
 *
 * `acknowledged` counts the tickets with an acknowledgement, `onTime` of those
 * with `acknowledged_at <= deadline_at`, `late` the rest. `openOverdue` counts
 * the still-unacknowledged, open (non-closed, non-cancelled) tickets whose
 * deadline has passed — a ticket without an acknowledgement has no compliance
 * result and is counted only there. `onTimeRate` is `null` when nothing was
 * acknowledged.
 */
export async function queryCompliance(
  database: Db,
  filter: StatsFilter,
  now: Date = new Date(),
): Promise<Compliance> {
  const { where } = buildStatsFilter(filter, now)

  const rows = (await database.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE "acknowledged_at" IS NOT NULL)::int AS acknowledged,
      COUNT(*) FILTER (
        WHERE "acknowledged_at" IS NOT NULL AND "acknowledged_at" <= "deadline_at"
      )::int AS on_time,
      COUNT(*) FILTER (
        WHERE "acknowledged_at" IS NULL
          AND "status" NOT IN ('CLOSED', 'CANCELLED')
          AND "deadline_at" < ${timestampParam(now)}
      )::int AS open_overdue
    FROM "stats_tickets"
    WHERE ${where}
  `)) as ComplianceRow[]

  const row = rows[0]
  const acknowledged = Number(row?.acknowledged ?? 0)
  const onTime = Number(row?.on_time ?? 0)
  const openOverdue = Number(row?.open_overdue ?? 0)

  return {
    acknowledged,
    onTime,
    late: Math.max(0, acknowledged - onTime),
    openOverdue,
    onTimeRate: acknowledged > 0 ? onTime / acknowledged : null,
  }
}

type CountRow = { value: number }
type ReasonRow = { reason: string; count: number }

/**
 * Decline rate and top reasons of the filtered tickets (`specs/12-stats.md`
 * §12.5, WP-M9-11).
 *
 * The denominator is the number of distinct tickets in range that reached
 * `OFFERED` or `ASSIGNED` (a current status or an `offered`/`assigned`/`claimed`
 * event), the numerator the distinct tickets with a `declined` event.
 * `topReasons` groups the normalized `reason` of those events, limited to ten
 * rows. The rate is `null` when the denominator is zero.
 */
export async function queryDeclines(
  database: Db,
  filter: StatsFilter,
  now: Date = new Date(),
): Promise<Declines> {
  const { where } = buildStatsFilter(filter, now)

  const denominatorRows = (await database.execute(sql`
    WITH filtered AS (
      SELECT "ticket_no" FROM "stats_tickets" WHERE ${where}
    )
    SELECT COUNT(DISTINCT f."ticket_no")::int AS value
    FROM filtered f
    JOIN "tickets" t ON t."ticket_no" = f."ticket_no"
    WHERE t."status" IN ('OFFERED', 'ASSIGNED')
      OR EXISTS (
        SELECT 1 FROM "ticket_events" e
        WHERE e."ticket_id" = t."id"
          AND e."type" IN ('offered', 'assigned', 'claimed')
      )
  `)) as CountRow[]

  const numeratorRows = (await database.execute(sql`
    WITH filtered AS (
      SELECT "ticket_no" FROM "stats_tickets" WHERE ${where}
    )
    SELECT COUNT(DISTINCT f."ticket_no")::int AS value
    FROM filtered f
    JOIN "tickets" t ON t."ticket_no" = f."ticket_no"
    JOIN "ticket_events" e ON e."ticket_id" = t."id" AND e."type" = 'declined'
  `)) as CountRow[]

  const reasonRows = (await database.execute(sql`
    WITH filtered AS (
      SELECT "ticket_no" FROM "stats_tickets" WHERE ${where}
    )
    SELECT lower(trim(e."payload" ->> 'reason')) AS reason, COUNT(*)::int AS count
    FROM filtered f
    JOIN "tickets" t ON t."ticket_no" = f."ticket_no"
    JOIN "ticket_events" e ON e."ticket_id" = t."id" AND e."type" = 'declined'
    WHERE e."payload" ? 'reason' AND trim(e."payload" ->> 'reason') <> ''
    GROUP BY 1
    ORDER BY count DESC, reason ASC
    LIMIT 10
  `)) as ReasonRow[]

  const denominator = Number(denominatorRows[0]?.value ?? 0)
  const numerator = Number(numeratorRows[0]?.value ?? 0)

  return {
    declineRate: denominator > 0 ? numerator / denominator : null,
    topReasons: reasonRows.map((row) => ({
      reason: String(row.reason),
      count: Number(row.count),
    })),
  }
}
