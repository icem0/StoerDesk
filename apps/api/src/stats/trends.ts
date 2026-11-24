import { sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import type { StatsFilter } from '@stoerdesk/shared'
import { buildStatsFilter } from './filters'

type Db = Database['database']

/**
 * One point of the trend (`specs/12-stats.md` §12.11, ADR-0049 decision 3).
 *
 * The averages are the average of the tickets that were **reported** in the
 * bucket: the reaction time of a ticket runs from its report, so the ticket
 * belongs to the bucket of its report. A bucket without a sample answers
 * `null` — the line has a gap there and does not pretend a value.
 */
export type TrendPoint = {
  bucketStart: string
  tickets: number
  reviewMinutes: number | null
  acknowledgeMinutes: number | null
  processingMinutes: number | null
  closed: number
}

/** The trend answer of `specs/12-stats.md` §12.11. */
export type Trends = {
  points: TrendPoint[]
}

type TrendRow = {
  bucket_start: Date | string
  tickets: string
  review_minutes: string | null
  acknowledge_minutes: string | null
  processing_minutes: string | null
  closed: string
}

/**
 * The bucket unit of the trend and the step between two buckets — the same
 * units as the series of the frequency (`specs/12-stats.md` §12.3).
 */
const BUCKETS = {
  day: { unit: "'day'", step: "'1 day'" },
  week: { unit: "'week'", step: "'1 week'" },
  month: { unit: "'month'", step: "'1 month'" },
} as const

/** Coerces a database timestamp value (Date or string) to a valid Date. */
function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(String(value))

  return Number.isFinite(date.getTime()) ? date : new Date(0)
}

/** An average of minutes as a whole number; `null` without a sample. */
function minutes(value: string | null): number | null {
  return value === null ? null : Math.round(Number(value))
}

/**
 * The trend of the reaction times and of the processing time
 * (`specs/12-stats.md` §12.11).
 *
 * One aggregate over the filtered set: per bucket the number of the reported
 * tickets, the average minutes of the review phase, of the acknowledge phase
 * and of the processing time (`closed_at` minus `reported_at`). The buckets
 * have no gaps: an empty bucket answers `tickets: 0` and `null` for every
 * average, so the axis of the diagram stays continuous.
 *
 * The aggregation happens in SQL — the browser only draws the answer
 * (`PLAN.md` §13, ADR-0012).
 */
export async function queryTrends(
  database: Db,
  filter: StatsFilter,
  now: Date = new Date(),
): Promise<Trends> {
  const { where, range } = buildStatsFilter(filter, now)
  const bucket = BUCKETS[filter.bucket ?? 'day']

  const rows = (await database.execute(sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${sql.raw(bucket.unit)}, ${range.fromUtc.toISOString()}::timestamptz AT TIME ZONE 'Europe/Berlin'),
        date_trunc(${sql.raw(bucket.unit)}, ${range.toUtc.toISOString()}::timestamptz AT TIME ZONE 'Europe/Berlin'),
        ${sql.raw(bucket.step)}::interval
      ) AS bucket_start
    ),
    grouped AS (
      SELECT
        date_trunc(${sql.raw(bucket.unit)}, "reported_at" AT TIME ZONE 'Europe/Berlin') AS bucket_start,
        COUNT(*) AS tickets,
        ROUND(AVG(EXTRACT(EPOCH FROM ("review_started_at" - "reported_at")) / 60.0)
          FILTER (WHERE "review_started_at" IS NOT NULL
            AND "review_started_at" >= "reported_at")) AS review_minutes,
        ROUND(AVG(EXTRACT(EPOCH FROM ("acknowledged_at" - "reported_at")) / 60.0)
          FILTER (WHERE "acknowledged_at" IS NOT NULL
            AND "acknowledged_at" >= "reported_at")) AS acknowledge_minutes,
        ROUND(AVG(EXTRACT(EPOCH FROM ("closed_at" - "reported_at")) / 60.0)
          FILTER (WHERE "closed_at" IS NOT NULL
            AND "closed_at" >= "reported_at")) AS processing_minutes,
        COUNT(*) FILTER (WHERE "closed_at" IS NOT NULL) AS closed
      FROM "stats_tickets"
      WHERE ${where}
      GROUP BY 1
    )
    SELECT
      -- The bucket start as the UTC instant of the local bucket boundary.
      (b.bucket_start AT TIME ZONE 'Europe/Berlin') AS bucket_start,
      COALESCE(g.tickets, 0)::text AS tickets,
      g.review_minutes,
      g.acknowledge_minutes,
      g.processing_minutes,
      COALESCE(g.closed, 0)::text AS closed
    FROM buckets b
    LEFT JOIN grouped g ON g.bucket_start = b.bucket_start
    ORDER BY b.bucket_start
  `)) as TrendRow[]

  return {
    points: rows.map((row) => ({
      bucketStart: asDate(row.bucket_start).toISOString(),
      tickets: Number(row.tickets),
      reviewMinutes: minutes(row.review_minutes),
      acknowledgeMinutes: minutes(row.acknowledge_minutes),
      processingMinutes: minutes(row.processing_minutes),
      closed: Number(row.closed),
    })),
  }
}
