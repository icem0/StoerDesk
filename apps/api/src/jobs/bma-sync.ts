import { PgBoss } from 'pg-boss'

import type { Env } from '../config/env'
import { createDatabase } from '../db/client'
import { BmaCloudError, createBmaCloudClient } from '../integrations/bmacloud/client'
import { readBmaSyncSchedule, type BmaSyncScheduleEnv } from '../integrations/bmacloud/routes'
import { syncBmaAnlagen } from '../integrations/bmacloud/sync'

/**
 * Scheduled BMAcloud pull (`specs/17-bmacloud-sync.md` §17.5, ADR-0003,
 * WP-M2-36). The shape follows `jobs/qr-cleanup.ts`: pg-boss owns the cron,
 * every job opens its own short-lived pool and the scheduler is started only
 * from the direct API start — `buildServer()` and the test suite never create
 * the pg-boss schema.
 *
 * The cron and the enabled flag are read once at start from the `settings` rows
 * `bma.sync.cron` / `bma.sync.enabled`, with `BMA_SYNC_CRON` /
 * `BMA_SYNC_ENABLED` as the fallback. An empty `BMA_API_KEY` disables the job
 * completely, so a deployment without BMAcloud credentials never schedules a
 * pull that could only fail.
 */

/** pg-boss queue name of the daily Anlagen pull. */
export const BMA_ANLAGE_SYNC_QUEUE = 'bma-anlage-sync'

/** Structured logger shape (Pino-compatible); never carries the bearer key. */
export type BmaSyncLogger = {
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

export type BmaSyncJobEnv = BmaSyncScheduleEnv & Pick<Env, 'BMA_API_BASE_URL' | 'BMA_API_KEY'>

/** The stored schedule pair, or `undefined` when the job must not run at all. */
async function storedSchedule(
  connectionString: string,
  env: BmaSyncJobEnv,
  log?: BmaSyncLogger,
): Promise<{ cron: string } | undefined> {
  const { client, database } = createDatabase(connectionString)

  try {
    const schedule = await readBmaSyncSchedule(database, env)

    if (!schedule.enabled) {
      log?.info({ queue: BMA_ANLAGE_SYNC_QUEUE }, 'BMA sync schedule disabled')

      return undefined
    }

    return { cron: schedule.cron }
  } finally {
    await client.end({ timeout: 5 })
  }
}

/**
 * Starts pg-boss, creates the sync queue, registers the worker and schedules the
 * pull; returns `undefined` when the credentials or the enabled flag disable it,
 * so the caller only has to `stop()` what really started.
 */
export async function startBmaAnlageSync(
  connectionString: string,
  env: BmaSyncJobEnv,
  log?: BmaSyncLogger,
): Promise<PgBoss | undefined> {
  if (env.BMA_API_KEY.trim() === '') {
    log?.info({ queue: BMA_ANLAGE_SYNC_QUEUE }, 'BMA sync job disabled: BMA_API_KEY is not set')

    return undefined
  }

  const schedule = await storedSchedule(connectionString, env, log)

  if (schedule === undefined) {
    return undefined
  }

  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    // Message and stack only: pg-boss errors never carry credentials.
    log?.error({
      err: { message: error.message, stack: error.stack },
      queue: BMA_ANLAGE_SYNC_QUEUE,
    })
  })

  await boss.start()
  await boss.createQueue(BMA_ANLAGE_SYNC_QUEUE)

  await boss.work(BMA_ANLAGE_SYNC_QUEUE, async () => {
    const { client: pool, database } = createDatabase(connectionString)

    try {
      const bmaCloud = createBmaCloudClient({
        baseUrl: env.BMA_API_BASE_URL,
        apiKey: env.BMA_API_KEY,
      })
      const anlagen = await bmaCloud.listAnlagen()
      const run = await syncBmaAnlagen(database, anlagen)

      log?.info(
        {
          queue: BMA_ANLAGE_SYNC_QUEUE,
          status: run.status,
          total: run.total,
          created: run.created,
          updated: run.updated,
          unchanged: run.unchanged,
          deactivated: run.deactivated,
          conflicts: run.conflicts.length,
        },
        'BMA sync run finished',
      )
    } catch (error) {
      // Only the fixed code of a client error — never the key, never a URL query.
      log?.error(
        {
          queue: BMA_ANLAGE_SYNC_QUEUE,
          code: error instanceof BmaCloudError ? error.code : 'bma_sync_failed',
        },
        'BMA sync run failed',
      )
    } finally {
      await pool.end({ timeout: 5 })
    }
  })

  await boss.schedule(BMA_ANLAGE_SYNC_QUEUE, schedule.cron)

  log?.info({ queue: BMA_ANLAGE_SYNC_QUEUE, cron: schedule.cron }, 'BMA sync job scheduled')

  return boss
}
