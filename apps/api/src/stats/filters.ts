import { sql, type SQL } from 'drizzle-orm'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

import type { StatsFilter } from '@stoerdesk/shared'

/** The time zone of every local calendar boundary (`PLAN.md` §15). */
const BERLIN = 'Europe/Berlin'

/** The resolved statistics range: local calendar days and their UTC instants. */
export type StatsRange = {
  /** First local day, `YYYY-MM-DD`. */
  fromDate: string
  /** Last local day, `YYYY-MM-DD` (inclusive). */
  toDate: string
  /** Start of the first local day as a UTC instant. */
  fromUtc: Date
  /** End of the last local day as a UTC instant. */
  toUtc: Date
}

/** The filter predicate over the statistics views. */
export type StatsFilterQuery = {
  /** The `WHERE` fragment over `stats_tickets` / `stats_ticket_faults`. */
  where: SQL
  /** The resolved range both sides of the boundary agree on. */
  range: StatsRange
}

/**
 * A timestamp as a bound parameter.
 *
 * The driver cannot serialize a `Date` through the raw SQL template, so the
 * instant travels as its ISO string and the cast makes it a `timestamptz`.
 */
function timestampParam(instant: Date): SQL {
  return sql`${instant.toISOString()}::timestamptz`
}

/** A calendar date as `YYYY-MM-DD`. */
function formatLocalDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The year, month and day of a `YYYY-MM-DD` calendar date. */
type DateParts = { year: number; month: number; day: number }

/** Parses a `YYYY-MM-DD` calendar date. */
function parseLocalDate(date: string): DateParts {
  const [year, month, day] = date.split('-').map((part) => Number(part))

  return {
    year: year ?? 1970,
    month: month ?? 1,
    day: day ?? 1,
  }
}

/** The Berlin calendar date of an instant, as `YYYY-MM-DD`. */
function localDate(instant: Date): string {
  const zoned = toZonedTime(instant, BERLIN)

  return formatLocalDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate())
}

/** A Berlin calendar date shifted by whole days, as `YYYY-MM-DD`. */
function shiftLocalDate(date: string, days: number): string {
  const { year, month, day } = parseLocalDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))

  return formatLocalDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  )
}

/** The UTC instant of a Berlin wall-clock moment. */
function berlinInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): Date {
  return fromZonedTime(
    new Date(year, month - 1, day, hour, minute, second, millisecond),
    BERLIN,
  )
}

/**
 * Resolves the local range of the statistics filter (`specs/12-stats.md` §12.1).
 *
 * `from` and `to` are calendar days in `Europe/Berlin` and inclusive; the
 * default is the last 30 days. The bounds become UTC instants, so a DST day
 * keeps its real length instead of a fixed 24 hours.
 */
export function resolveStatsRange(filter: StatsFilter, now: Date): StatsRange {
  const toDate = filter.to ?? localDate(now)
  const fromDate = filter.from ?? shiftLocalDate(toDate, -29)

  const from = parseLocalDate(fromDate)
  const to = parseLocalDate(toDate)

  return {
    fromDate,
    toDate,
    fromUtc: berlinInstant(from.year, from.month, from.day, 0, 0, 0, 0),
    toUtc: berlinInstant(to.year, to.month, to.day, 23, 59, 59, 999),
  }
}

/**
 * Converts the shared statistics filter into a SQL predicate over
 * `stats_tickets` (`specs/12-stats.md` §12.1, WP-M9-10).
 *
 * The range covers the local days `from` … `to`; `objectNo` matches
 * case-insensitively, `systemType`, `priority` and `technician` match exactly.
 * Test and suspected-spam tickets stay excluded unless the caller opts in.
 */
export function buildStatsFilter(filter: StatsFilter, now: Date): StatsFilterQuery {
  const range = resolveStatsRange(filter, now)
  const conditions: SQL[] = [
    sql`"reported_at" >= ${timestampParam(range.fromUtc)}`,
    sql`"reported_at" <= ${timestampParam(range.toUtc)}`,
  ]

  if (filter.includeTest !== true) {
    conditions.push(sql`"is_test" = false`)
  }

  if (filter.includeSpam !== true) {
    conditions.push(sql`"suspected_spam" = false`)
  }

  if (filter.objectNo !== undefined && filter.objectNo.trim() !== '') {
    conditions.push(sql`lower("object_no") = lower(${filter.objectNo.trim()})`)
  }

  if (filter.systemType !== undefined && filter.systemType.trim() !== '') {
    conditions.push(sql`"system_type" = ${filter.systemType.trim()}`)
  }

  if (filter.priority !== undefined) {
    conditions.push(sql`"priority" = ${filter.priority}`)
  }

  if (filter.technician !== undefined && filter.technician !== '') {
    conditions.push(sql`"assigned_user_id" = ${filter.technician}`)
  }

  return {
    where: sql.join(conditions, sql` AND `),
    range,
  }
}
