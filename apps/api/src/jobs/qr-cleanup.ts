import { lte } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'

import { createDatabase, type Database } from '../db/client'
import { oldQrTokens } from '../db/schema'

/**
 * Daily cleanup of retired QR tokens
 * (`specs/08-objects-api.md` §9.2, `specs/02-data-model.md` §4.7, WP-M2-02b).
 * The deletion is a plain function so a test can call it without pg-boss; the
 * scheduler around it is only started from the direct API start.
 */

type Db = Database['database']

/** pg-boss queue name of the daily retired-token cleanup. */
export const QR_TOKEN_CLEANUP_QUEUE = 'qr-token-cleanup'

/** One run per day, 03:00 server time. */
export const QR_TOKEN_CLEANUP_CRON = '0 3 * * *'

/** Structured logger shape (Pino-compatible); never carries PII. */
export type QrCleanupLogger = {
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

/**
 * Deletes every retired token whose `expires_at` is at or before `now` and
 * returns how many rows were removed.
 */
export async function deleteExpiredQrTokens(database: Db, now: Date = new Date()): Promise<number> {
  const deleted = await database
    .delete(oldQrTokens)
    .where(lte(oldQrTokens.expiresAt, now))
    .returning({ id: oldQrTokens.id })

  return deleted.length
}

/**
 * Starts pg-boss, creates the cleanup queue, registers the worker and the daily
 * schedule, and returns the instance so the caller can `stop()` it. Each job
 * opens its own short-lived pool, so the worker never shares the request pool.
 */
export async function startQrTokenCleanup(
  connectionString: string,
  log?: QrCleanupLogger,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    // Message and stack only: pg-boss errors never carry credentials.
    log?.error({ err: error, queue: QR_TOKEN_CLEANUP_QUEUE }, 'qr cleanup job failed')
  })

  await boss.start()
  await boss.createQueue(QR_TOKEN_CLEANUP_QUEUE)

  await boss.work(QR_TOKEN_CLEANUP_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const deleted = await deleteExpiredQrTokens(database)

      log?.info({ queue: QR_TOKEN_CLEANUP_QUEUE, deleted }, 'qr token cleanup finished')
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(QR_TOKEN_CLEANUP_QUEUE, QR_TOKEN_CLEANUP_CRON)

  return boss
}
