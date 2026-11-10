import { sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import type { StatsFilter } from '@stoerdesk/shared'
import { buildStatsFilter } from './filters'

type Db = Database['database']

/** The frequency answer of `specs/12-stats.md` §12.3. */
export type Frequency = {
  series: { bucketStart: string; total: number }[]
  bySystemType: { key: string; count: number }[]
  byFaultTemplate: { key: string; count: number }[]
  bySource: { key: string; count: number }[]
  byDetectedError: { key: string; count: number }[]
}

type SeriesRow = { bucket_start: Date | string; total: string }
type GroupRow = { key: string; count: string }
type DetectedErrorRow = { key: string; count: string }

/** Coerces a database timestamp value (Date or string) to a valid Date. */
function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(String(value))

  return Number.isFinite(date.getTime()) ? date : new Date(0)
}

/**
 * The bucket unit of the series and the step between two buckets.
 *
 * The step is a fixed interval in local calendar terms: a week starts on
 * Monday (`specs/12-stats.md` §12.3), a month is a calendar month. The
 * boundaries are computed on the Berlin local date of `reported_at`, so a
 * ticket lands in the same local bucket whatever the server time zone is.
 */
const BUCKETS = {
  day: { unit: "'day'", step: "'1 day'" },
  week: { unit: "'week'", step: "'1 week'" },
  month: { unit: "'month'", step: "'1 month'" },
} as const

/**
 * The frequency of the filtered tickets (`specs/12-stats.md` §12.3).
 *
 * The series has no gaps: an empty bucket is answered with `total: 0`, so the
 * chart has a continuous axis. The three groupings count the tickets of the
 * same filtered set — `bySystemType` over the object type, `byFaultTemplate`
 * over the language-neutral template keys and `bySource` over the report
 * source.
 */
export async function queryFrequency(
  database: Db,
  filter: StatsFilter,
  now: Date = new Date(),
): Promise<Frequency> {
  const { where, range } = buildStatsFilter(filter, now)
  const bucket = BUCKETS[filter.bucket ?? 'day']

  const series = (await database.execute(sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${sql.raw(bucket.unit)}, ${range.fromUtc.toISOString()}::timestamptz AT TIME ZONE 'Europe/Berlin'),
        date_trunc(${sql.raw(bucket.unit)}, ${range.toUtc.toISOString()}::timestamptz AT TIME ZONE 'Europe/Berlin'),
        ${sql.raw(bucket.step)}::interval
      ) AS bucket_start
    ),
    counted AS (
      SELECT
        date_trunc(${sql.raw(bucket.unit)}, "reported_at" AT TIME ZONE 'Europe/Berlin') AS bucket_start,
        COUNT(*) AS total
      FROM "stats_tickets"
      WHERE ${where}
      GROUP BY 1
    )
    SELECT
      -- The bucket start as the UTC instant of the local bucket boundary.
      (b.bucket_start AT TIME ZONE 'Europe/Berlin') AS bucket_start,
      COALESCE(c.total, 0)::text AS total
    FROM buckets b
    LEFT JOIN counted c ON c.bucket_start = b.bucket_start
    ORDER BY b.bucket_start
  `)) as SeriesRow[]

  const bySystemType = (await database.execute(sql`
    -- An object without an external type counts under the empty key, so the
    -- grouping covers every ticket of the filtered set.
    SELECT COALESCE("system_type", '') AS key, COUNT(*)::text AS count
    FROM "stats_tickets"
    WHERE ${where}
    GROUP BY "system_type"
    ORDER BY COUNT(*) DESC, key
  `)) as GroupRow[]
  const byFaultTemplate = (await database.execute(sql`
    SELECT "fault_template_key" AS key, COUNT(*)::text AS count
    FROM "stats_ticket_faults"
    WHERE ${where}
    GROUP BY "fault_template_key"
    ORDER BY COUNT(*) DESC, key
  `)) as GroupRow[]

  const bySource = (await database.execute(sql`
    SELECT "source" AS key, COUNT(*)::text AS count
    FROM "stats_tickets"
    WHERE ${where}
    GROUP BY "source"
    ORDER BY COUNT(*) DESC, key
  `)) as GroupRow[]

  const byDetectedError = (await database.execute(sql`
    SELECT "detected_error_key" AS key, COUNT(*)::text AS count
    FROM "stats_ticket_detected_errors"
    WHERE ${where}
    GROUP BY "detected_error_key"
    ORDER BY COUNT(*) DESC, key
  `)) as DetectedErrorRow[]

  return {
    series: series.map((row) => ({
      bucketStart: asDate(row.bucket_start).toISOString(),
      total: Number(row.total),
    })),
    bySystemType: bySystemType.map((row) => ({ key: row.key, count: Number(row.count) })),
    byFaultTemplate: byFaultTemplate.map((row) => ({ key: row.key, count: Number(row.count) })),
    bySource: bySource.map((row) => ({ key: row.key, count: Number(row.count) })),
    byDetectedError: byDetectedError.map((row) => ({ key: row.key, count: Number(row.count) })),
  }
}
