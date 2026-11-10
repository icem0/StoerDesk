import { sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import type { StatsFilter } from '@stoerdesk/shared'
import { buildStatsFilter } from './filters'

type Db = Database['database']

/** The phase aggregates of `specs/12-stats.md` §12.2. */
export type ReactionTimes = {
  review: { count: number; medianMinutes: number; averageMinutes: number; p90Minutes: number }
  firstResponse: { count: number; medianMinutes: number; averageMinutes: number; p90Minutes: number }
  acknowledge: { count: number; medianMinutes: number; averageMinutes: number; p90Minutes: number }
  pausedTickets: number
  pauseMinutes: number
}

type PhaseRow = {
  count: string
  median_minutes: string | null
  average_minutes: string | null
  p90_minutes: string | null
}

/** The end column of one phase; the durations are measured from `reported_at`. */
type Phase = 'review_started_at' | 'first_response_at' | 'acknowledged_at'

/**
 * The reaction times of the filtered tickets (`specs/12-stats.md` §12.2).
 *
 * Every phase is one aggregate over the filtered set: `count`, the median
 * (`percentile_cont(0.5)`), the average and the p90 (`percentile_cont(0.9)`),
 * rounded to whole minutes. A negative duration — impossible for a valid
 * workflow — is ignored, so a legacy row cannot skew the aggregate.
 *
 * Pauses are reported next to the phases and never subtracted from them
 * (ADR-0012 decision 8): `pauseMinutes` is the summed pause length of the
 * tickets in the range and `pausedTickets` counts the tickets that carry a
 * pause at all.
 */
export async function queryReactionTimes(
  database: Db,
  filter: StatsFilter,
  now: Date = new Date(),
): Promise<ReactionTimes> {
  const { where } = buildStatsFilter(filter, now)

  const [review, firstResponse, acknowledge] = await Promise.all([
    runPhase(database, 'review_started_at', where),
    runPhase(database, 'first_response_at', where),
    runPhase(database, 'acknowledged_at', where),
  ])

  const pauseRows = (await database.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE "pause_seconds" > 0)::text AS paused_tickets,
      COALESCE(SUM("pause_seconds"), 0)::text AS pause_seconds
    FROM "stats_tickets"
    WHERE ${where}
  `)) as { paused_tickets: string; pause_seconds: string }[]

  const pause = pauseRows[0]

  return {
    review,
    firstResponse,
    acknowledge,
    pausedTickets: Number(pause?.paused_tickets ?? 0),
    pauseMinutes: Math.round(Number(pause?.pause_seconds ?? 0) / 60),
  }
}

/** Runs the aggregate of one phase. */
async function runPhase(
  database: Db,
  endColumn: Phase,
  where: ReturnType<typeof buildStatsFilter>['where'],
): Promise<ReactionTimes['review']> {
  const rows = (await database.execute(sql`
    SELECT
      COUNT(*)::text AS count,
      ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_minutes))::text AS median_minutes,
      ROUND(AVG(duration_minutes))::text AS average_minutes,
      ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_minutes))::text AS p90_minutes
    FROM (
      SELECT
        EXTRACT(EPOCH FROM ("${sql.raw(endColumn)}" - "reported_at")) / 60.0 AS duration_minutes
      FROM "stats_tickets"
      WHERE "${sql.raw(endColumn)}" IS NOT NULL
        AND "${sql.raw(endColumn)}" >= "reported_at"
        AND ${where}
    ) AS durations
  `)) as PhaseRow[]

  const row = rows[0]

  return {
    count: Number(row?.count ?? 0),
    medianMinutes: Math.round(Number(row?.median_minutes ?? 0)),
    averageMinutes: Math.round(Number(row?.average_minutes ?? 0)),
    p90Minutes: Math.round(Number(row?.p90_minutes ?? 0)),
  }
}
