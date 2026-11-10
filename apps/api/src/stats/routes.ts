import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  PERMISSIONS,
  complianceResponseSchema,
  frequencyResponseSchema,
  reactionTimesResponseSchema,
  statsFilterSchema,
  topObjectsResponseSchema,
  type StatsFilter,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { readDashboardSettings } from '../settings/dashboard'
import { queryCompliance } from './compliance'
import { queryFrequency } from './frequency'
import { queryTopObjects } from './objects'
import { queryReactionTimes } from './reaction-times'

type Db = Database['database']

export type StatsRoutesOptions = {
  database: Db
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/** True for a real calendar date in `YYYY-MM-DD` form. */
function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}

/** True when `from`/`to` form an impossible range (reversed or over 366 days). */
function rangeInvalid(query: Record<string, unknown>): boolean {
  const { from, to } = query

  if (typeof from !== 'string' || typeof to !== 'string') {
    return false
  }

  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    return false
  }

  const diff =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000

  return diff < 0 || diff > 366
}

/** Booleans arrive as query strings; turn the two flags into real booleans. */
function normalizeQuery(query: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...query }

  for (const key of ['includeTest', 'includeSpam']) {
    if (result[key] === 'true') {
      result[key] = true
    } else if (result[key] === 'false') {
      result[key] = false
    }
  }

  return result
}

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

type FilterResult =
  | { ok: true; filter: StatsFilter }
  | { ok: false; code: string; fields?: string[] }

/**
 * Parses the shared filter of `specs/12-stats.md` §12.1. A malformed filter is
 * `invalid_request` with field errors, an impossible range is
 * `stats_range_invalid` (§12.8).
 */
function parseFilter(rawQuery: unknown): FilterResult {
  const query = normalizeQuery((rawQuery ?? {}) as Record<string, unknown>)
  const parsed = statsFilterSchema.safeParse(query)

  if (parsed.success) {
    return { ok: true, filter: parsed.data }
  }

  const issues = parsed.error.issues
  const rangeOnly = issues.every(
    (issue) =>
      issue.path.length === 1 &&
      (issue.path[0] === 'from' || issue.path[0] === 'to'),
  )

  if (rangeOnly && rangeInvalid(query)) {
    return { ok: false, code: 'stats_range_invalid' }
  }

  return { ok: false, code: 'invalid_request', fields: fieldPaths(parsed.error) }
}

/**
 * Statistics JSON routes (`specs/12-stats.md` §12.8, WP-M9-12).
 *
 * Four read-only routes guarded by `stats.read`. The filter is parsed once; the
 * objects route loads the conspicuous threshold, the compliance route the
 * request time.
 */
export const statsRoutes = fp<StatsRoutesOptions>(
  async (app, { database }) => {
    const guard = requirePermission(database, PERMISSIONS.stats.read)

    app.get(
      '/api/v1/stats/reaction-times',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = parseFilter(request.query)

        if (!parsed.ok) {
          return reply
            .code(422)
            .send({ code: parsed.code, params: parsed.fields ? { fields: parsed.fields } : {} })
        }

        const result = await queryReactionTimes(database, parsed.filter)
        return reply.code(200).send(reactionTimesResponseSchema.parse(result))
      },
    )

    app.get(
      '/api/v1/stats/frequency',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = parseFilter(request.query)

        if (!parsed.ok) {
          return reply
            .code(422)
            .send({ code: parsed.code, params: parsed.fields ? { fields: parsed.fields } : {} })
        }

        if (parsed.filter.bucket === undefined) {
          return reply.code(422).send({ code: 'invalid_request', params: { fields: ['bucket'] } })
        }

        const result = await queryFrequency(database, parsed.filter)
        return reply.code(200).send(frequencyResponseSchema.parse(result))
      },
    )

    app.get(
      '/api/v1/stats/objects',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = parseFilter(request.query)

        if (!parsed.ok) {
          return reply
            .code(422)
            .send({ code: parsed.code, params: parsed.fields ? { fields: parsed.fields } : {} })
        }

        const settings = await readDashboardSettings(database)
        const topObjects = await queryTopObjects(database, parsed.filter, {
          conspicuousThreshold: settings.conspicuousThreshold,
        })

        return reply.code(200).send(topObjectsResponseSchema.parse({ topObjects }))
      },
    )

    app.get(
      '/api/v1/stats/compliance',
      { preHandler: guard },
      async (request, reply) => {
        const parsed = parseFilter(request.query)

        if (!parsed.ok) {
          return reply
            .code(422)
            .send({ code: parsed.code, params: parsed.fields ? { fields: parsed.fields } : {} })
        }

        const result = await queryCompliance(database, parsed.filter)
        return reply.code(200).send(complianceResponseSchema.parse(result))
      },
    )
  },
  { name: 'stoerdesk-stats' },
)
