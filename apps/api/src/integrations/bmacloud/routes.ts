import { desc, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  bmaSyncCronSchema,
  bmaSyncRunsQuerySchema,
  bmaSyncRunsResponseSchema,
  bmaSyncRunRowSchema,
  bmaSyncScheduleRequestSchema,
  bmaSyncScheduleResponseSchema,
  PERMISSIONS,
  type BmaSyncRunRow,
  type BmaSyncSchedule,
} from '@stoerdesk/shared'

import { requirePermission } from '../../auth/requirePermission'
import type { Env } from '../../config/env'
import type { Database } from '../../db/client'
import { bmaSyncRuns, settings } from '../../db/schema'
import { createBmaCloudClient, BmaCloudError } from './client'
import { syncBmaAnlagen } from './sync'

/**
 * Admin API of the BMAcloud object sync (`specs/17-bmacloud-sync.md` §17.5,
 * ADR-0003, WP-M2-36). The guards are the existing object permissions
 * (`object.read` / `object.import` / `object.write`) — ADR-0003 deliberately
 * adds no new permission key. Every answer is `{ code, params }` on an error and
 * never carries the bearer key.
 *
 * The schedule lives in two `settings` rows (`bma.sync.enabled`,
 * `bma.sync.cron`); when a row is absent the environment pair
 * (`BMA_SYNC_ENABLED` / `BMA_SYNC_CRON`) is the fallback, which is also what the
 * pg-boss job of `jobs/bma-sync.ts` schedules on.
 */

type Db = Database['database']

/** Setting keys of the schedule pair (§17.5). */
export const BMA_SYNC_ENABLED_SETTING = 'bma.sync.enabled'
export const BMA_SYNC_CRON_SETTING = 'bma.sync.cron'

/** The environment half of the schedule fallback. */
export type BmaSyncScheduleEnv = Pick<Env, 'BMA_SYNC_ENABLED' | 'BMA_SYNC_CRON'>

export type BmaSyncRouteOptions = {
  database: Db
  env: BmaSyncScheduleEnv & Pick<Env, 'BMA_API_BASE_URL' | 'BMA_API_KEY'>
}

class BmaSyncRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'BmaSyncRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

async function storedValues(database: Db, keys: string[]): Promise<Map<string, unknown>> {
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys))

  return new Map(rows.map((row) => [row.key, row.value]))
}

/**
 * The effective schedule: the stored pair when it is present and well-typed,
 * otherwise the environment pair. A stored cron that no longer parses falls back
 * to the environment instead of breaking the scheduler.
 */
export async function readBmaSyncSchedule(
  database: Db,
  env: BmaSyncScheduleEnv,
): Promise<BmaSyncSchedule> {
  const stored = await storedValues(database, [BMA_SYNC_ENABLED_SETTING, BMA_SYNC_CRON_SETTING])
  const enabled = stored.get(BMA_SYNC_ENABLED_SETTING)
  const cron = stored.get(BMA_SYNC_CRON_SETTING)

  return bmaSyncScheduleResponseSchema.parse({
    enabled: typeof enabled === 'boolean' ? enabled : env.BMA_SYNC_ENABLED,
    cron:
      typeof cron === 'string' && bmaSyncCronSchema.safeParse(cron).success
        ? cron
        : env.BMA_SYNC_CRON,
  })
}

async function storeSetting(database: Db, key: string, value: unknown): Promise<void> {
  await database
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}

function toRunRow(row: {
  id: string
  startedAt: Date
  finishedAt: Date | null
  status: string
  total: number
  created: number
  updated: number
  unchanged: number
  deactivated: number
  conflicts: unknown
  errorCode: string | null
}): BmaSyncRunRow {
  return bmaSyncRunRowSchema.parse({
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
  })
}

export const bmaSyncRoutes = fp<BmaSyncRouteOptions>(
  async (app, { database, env }) => {
    app.get<{ Querystring: { limit?: string } }>(
      '/api/v1/admin/bma-sync/runs',
      { preHandler: requirePermission(database, PERMISSIONS.object.read) },
      async (request, reply) => {
        const parsed = bmaSyncRunsQuerySchema.safeParse(request.query)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const rows = await database
          .select({
            id: bmaSyncRuns.id,
            startedAt: bmaSyncRuns.startedAt,
            finishedAt: bmaSyncRuns.finishedAt,
            status: bmaSyncRuns.status,
            total: bmaSyncRuns.total,
            created: bmaSyncRuns.created,
            updated: bmaSyncRuns.updated,
            unchanged: bmaSyncRuns.unchanged,
            deactivated: bmaSyncRuns.deactivated,
            conflicts: bmaSyncRuns.conflicts,
            errorCode: bmaSyncRuns.errorCode,
          })
          .from(bmaSyncRuns)
          .orderBy(desc(bmaSyncRuns.startedAt), desc(bmaSyncRuns.id))
          .limit(parsed.data.limit)

        return bmaSyncRunsResponseSchema.parse({ runs: rows.map(toRunRow) })
      },
    )

    app.post(
      '/api/v1/admin/bma-sync/run',
      { preHandler: requirePermission(database, PERMISSIONS.object.import) },
      async (_request, reply) => {
        if (env.BMA_API_KEY.trim() === '') {
          // No key, no request, no run row (§17.5).
          return reply.code(409).send({ code: 'bma_not_configured', params: {} })
        }

        const client = createBmaCloudClient({
          baseUrl: env.BMA_API_BASE_URL,
          apiKey: env.BMA_API_KEY,
        })

        let anlagen: unknown[]

        try {
          anlagen = await client.listAnlagen()
        } catch (error) {
          if (error instanceof BmaCloudError) {
            throw new BmaSyncRouteError(502, error.code)
          }

          throw error
        }

        return syncBmaAnlagen(database, anlagen)
      },
    )

    app.patch(
      '/api/v1/admin/bma-sync/schedule',
      { preHandler: requirePermission(database, PERMISSIONS.object.write) },
      async (request, reply) => {
        const parsed = bmaSyncScheduleRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        await storeSetting(database, BMA_SYNC_ENABLED_SETTING, parsed.data.enabled)
        await storeSetting(database, BMA_SYNC_CRON_SETTING, parsed.data.cron)

        return bmaSyncScheduleResponseSchema.parse(await readBmaSyncSchedule(database, env))
      },
    )
  },
  { name: 'stoerdesk-bma-sync-routes' },
)
