import { sql, type SQL } from 'drizzle-orm'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

import type { Database } from '../db/client'
import type { StatsFilter } from '@stoerdesk/shared'
import { resolveStatsRange } from './filters'

type Db = Database['database']

/** The time zone of every local calendar boundary (`PLAN.md` §15). */
const BERLIN = 'Europe/Berlin'

/** One top-object row of `specs/12-stats.md` §12.4. */
export type TopObject = {
  objectNo: string
  objectName: string
  count: number
  conspicuous: boolean
}

/** The settings that influence the top-object query (§12.4). */
export type TopObjectsSettings = {
  conspicuousThreshold: number
}

/** A timestamp as a bound `timestamptz` parameter. */
function timestampParam(instant: Date): SQL {
  return sql`${instant.toISOString()}::timestamptz`
}

/** Start of the Berlin day `days` days before the `to` day of the range. */
function berlinDayStartMinusDays(toUtc: Date, days: number): Date {
  const zoned = toZonedTime(toUtc, BERLIN)
  zoned.setHours(0, 0, 0, 0)
  zoned.setDate(zoned.getDate() - days)

  return fromZonedTime(zoned, BERLIN)
}

/**
 * The dimension predicates of §12.1 over `stats_tickets`, without the date
 * range: object number (case-insensitive), system type, priority and technician
 * match exactly, test and spam tickets stay excluded unless the caller opts in.
 */
function dimensionConditions(filter: StatsFilter): SQL[] {
  const conditions: SQL[] = []

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

  return conditions
}

type TopObjectRow = {
  object_no: string
  object_name: string
  count: number
  conspicuous: boolean
}

/**
 * The top objects of the filtered set (`specs/12-stats.md` §12.4, WP-M9-11).
 *
 * Grouped by object, sorted by count descending and then by lower-case object
 * number, limited to 25 rows. `conspicuous` runs a second aggregate over the 90
 * days before `to`, independent of the selected range, against
 * `stats.conspicuous_threshold`. The flag never hides a row, it marks it.
 */
export async function queryTopObjects(
  database: Db,
  filter: StatsFilter,
  settings: TopObjectsSettings,
  now: Date = new Date(),
): Promise<TopObject[]> {
  const range = resolveStatsRange(filter, now)
  const conspicuousFromUtc = berlinDayStartMinusDays(range.toUtc, 90)
  const scanFromUtc =
    range.fromUtc.getTime() < conspicuousFromUtc.getTime()
      ? range.fromUtc
      : conspicuousFromUtc

  const conditions = dimensionConditions(filter)
  conditions.push(sql`"reported_at" >= ${timestampParam(scanFromUtc)}`)
  conditions.push(sql`"reported_at" <= ${timestampParam(range.toUtc)}`)
  const where = sql.join(conditions, sql` AND `)

  const inRange = sql`"reported_at" >= ${timestampParam(range.fromUtc)} AND "reported_at" <= ${timestampParam(range.toUtc)}`
  const inWindow = sql`"reported_at" >= ${timestampParam(conspicuousFromUtc)} AND "reported_at" <= ${timestampParam(range.toUtc)}`

  const rows = (await database.execute(sql`
    SELECT
      "object_no" AS object_no,
      "object_name" AS object_name,
      COUNT(*) FILTER (WHERE ${inRange})::int AS count,
      (COUNT(*) FILTER (WHERE ${inWindow}) > ${settings.conspicuousThreshold}) AS conspicuous
    FROM "stats_tickets"
    WHERE ${where}
    GROUP BY "object_id", "object_no", "object_name"
    HAVING COUNT(*) FILTER (WHERE ${inRange}) > 0
    ORDER BY count DESC, lower("object_no") ASC
    LIMIT 25
  `)) as TopObjectRow[]

  return rows.map((row) => ({
    objectNo: row.object_no,
    objectName: row.object_name,
    count: Number(row.count),
    conspicuous: row.conspicuous === true,
  }))
}
