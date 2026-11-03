import { PgBoss } from 'pg-boss'

import type { Env } from '../config/env'
import { createDatabase } from '../db/client'
import { BmaCloudError, createBmaCloudClient } from '../integrations/bmacloud/client'
import {
  readBmaApiKey,
  readBmaSyncSchedule,
  type BmaSyncScheduleEnv,
} from '../integrations/bmacloud/routes'
import { syncBmaAnlagen } from '../integrations/bmacloud/sync'

/**
 * Scheduled BMAcloud pull (`specs/17-bmacloud-sync.md` §17.5, ADR-0003,
 * WP-M2-36, WP-M2-46). The shape follows `jobs/qr-cleanup.ts`: pg-boss owns the
 * cron, every job opens its own short-lived pool and the scheduler is started
 * only from the direct API start — `buildServer()` and the test suite never
 * create the pg-boss schema.
 *
 * The cron and the enabled flag are read once at start from the `settings` rows
 * `bma.sync.cron` / `bma.sync.enabled`, with `BMA_SYNC_CRON` /
 * `BMA_SYNC_ENABLED` as the fallback. The bearer key is resolved by
 * `readBmaApiKey` — the `settings` row `bma.api.key` first, `BMA_API_KEY` as the
 * fallback (ADR-0005) — once at start, which decides whether the job is scheduled
 * at all, and again per run, so a key stored or removed on the admin page takes
 * effect without an API restart.
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

/**
 * The one startup read: the effective schedule pair and the effective bearer key
 * through a single short-lived pool. `undefined` means the job must not be
 * scheduled at all — a disabled schedule or no key in either source.
 */
async function startupState(
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

    if ((await readBmaApiKey(database, env)) === '') {
      log?.info(
        { queue: BMA_ANLAGE_SYNC_QUEUE },
        'BMA sync job disabled: neither bma.api.key nor BMA_API_KEY is set',
      )

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
  const schedule = await startupState(connectionString, env, log)

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
      // Resolved per run, so a key stored or deleted on the admin page needs no restart.
      const apiKey = await readBmaApiKey(database, env)
      const bmaCloud = createBmaCloudClient({
        baseUrl: env.BMA_API_BASE_URL,
        apiKey,
      })
      const anlagen = await bmaCloud.listAnlagen()

      // Best-effort reference list (WP-M2-65b): a failed call only omits the list.
      let anlagentypen: unknown[] | undefined

      try {
        anlagentypen = await bmaCloud.anlagentypen()
      } catch (error) {
        log?.warn(
          { code: error instanceof BmaCloudError ? error.code : 'bma_reference_failed' },
          'BMAcloud anlagentypen reference call failed',
        )
      }

      const run = await syncBmaAnlagen(database, anlagen, new Date(), anlagentypen)

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
