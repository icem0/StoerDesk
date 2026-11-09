import { desc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  bmaApiKeyRequestSchema,
  bmaCredentialsResponseSchema,
  bmaSyncCronSchema,
  bmaSyncRunsQuerySchema,
  bmaSyncRunsResponseSchema,
  bmaSyncRunRowSchema,
  bmaSyncScheduleRequestSchema,
  bmaSyncScheduleResponseSchema,
  PERMISSIONS,
  type BmaCredentialsResponse,
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
 *
 * The bearer key lives in the `settings` row `bma.api.key` when the admin set it
 * on the sync page and in `BMA_API_KEY` otherwise (ADR-0005). `readBmaApiKey`
 * resolves that order for the manual trigger and the scheduled job; no route of
 * this module ever answers the stored value — the credential routes report
 * `{ configured, source }` only.
 */

type Db = Database['database']

/** Setting keys of the schedule pair (§17.5). */
export const BMA_SYNC_ENABLED_SETTING = 'bma.sync.enabled'
export const BMA_SYNC_CRON_SETTING = 'bma.sync.cron'

/** Setting key of the bearer key stored by the admin (ADR-0005). */
export const BMA_API_KEY_SETTING = 'bma.api.key'

/** The environment half of the schedule fallback. */
export type BmaSyncScheduleEnv = Pick<Env, 'BMA_SYNC_ENABLED' | 'BMA_SYNC_CRON'>

/** The environment half of the bearer key fallback (ADR-0005). */
export type BmaCredentialEnv = Pick<Env, 'BMA_API_KEY'>

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

/** The stored key, or `undefined` when no usable row exists. */
async function storedApiKey(database: Db): Promise<string | undefined> {
  const value = (await storedValues(database, [BMA_API_KEY_SETTING])).get(BMA_API_KEY_SETTING)

  if (typeof value !== 'string' || value.trim() === '') {
    return undefined
  }

  return value.trim()
}

/**
 * The effective bearer key (ADR-0005): the stored `bma.api.key` row first, the
 * `BMA_API_KEY` environment as fallback, `''` when neither is set. Both the
 * manual trigger and the pg-boss job of `jobs/bma-sync.ts` run on this function,
 * so a key set on the admin page needs no restart.
 */
export async function readBmaApiKey(database: Db, env: BmaCredentialEnv): Promise<string> {
  return (await storedApiKey(database)) ?? env.BMA_API_KEY.trim()
}

/** What the credential routes answer: where the effective key comes from. */
export async function readBmaCredentials(
  database: Db,
  env: BmaCredentialEnv,
): Promise<BmaCredentialsResponse> {
  const source =
    (await storedApiKey(database)) !== undefined
      ? 'db'
      : env.BMA_API_KEY.trim() !== ''
        ? 'env'
        : 'none'

  return bmaCredentialsResponseSchema.parse({ configured: source !== 'none', source })
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
        const apiKey = await readBmaApiKey(database, env)

        if (apiKey === '') {
          // No key, no request, no run row (§17.5).
          return reply.code(409).send({ code: 'bma_not_configured', params: {} })
        }

        const client = createBmaCloudClient({
          baseUrl: env.BMA_API_BASE_URL,
          apiKey,
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

        // Best-effort reference list (WP-M2-65b): a failed call only omits the list,
        // it never fails the run, and only the fixed code is logged — never the key.
        let anlagentypen: unknown[] | undefined

        try {
          anlagentypen = await client.anlagentypen()
        } catch (error) {
          app.log.warn(
            { code: error instanceof BmaCloudError ? error.code : 'bma_reference_failed' },
            'BMAcloud anlagentypen reference call failed',
          )
        }

        return syncBmaAnlagen(database, anlagen, undefined, anlagentypen)
      },
    )

    app.get(
      '/api/v1/admin/bma-sync/schedule',
      { preHandler: requirePermission(database, PERMISSIONS.object.read) },
      async () => bmaSyncScheduleResponseSchema.parse(await readBmaSyncSchedule(database, env)),
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

    app.get(
      '/api/v1/admin/bma-sync/credentials',
      // SEC-009: only an importer sees whether the BMAcloud key is configured and
      // where it came from; `object.read` alone is not enough (reporter_internal,
      // office, oncall and manager all hold it).
      { preHandler: requirePermission(database, PERMISSIONS.object.import) },
      async () => readBmaCredentials(database, env),
    )

    app.put(
      '/api/v1/admin/bma-sync/credentials',
      { preHandler: requirePermission(database, PERMISSIONS.object.import) },
      async (request, reply) => {
        const parsed = bmaApiKeyRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        await storeSetting(database, BMA_API_KEY_SETTING, parsed.data.apiKey)

        // The stored value is never echoed back (ADR-0005).
        return bmaCredentialsResponseSchema.parse({ configured: true, source: 'db' })
      },
    )

    app.delete(
      '/api/v1/admin/bma-sync/credentials',
      { preHandler: requirePermission(database, PERMISSIONS.object.import) },
      async () => {
        await database.delete(settings).where(eq(settings.key, BMA_API_KEY_SETTING))

        return readBmaCredentials(database, env)
      },
    )
  },
  { name: 'stoerdesk-bma-sync-routes' },
)
