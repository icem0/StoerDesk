import { and, eq, inArray, isNotNull, lte, or } from 'drizzle-orm'
import { rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { PgBoss } from 'pg-boss'

import { createDatabase } from '../db/client'
import type { Database } from '../db/client'
import { bmaSyncRuns, reportThrottle, ticketPhotos, tickets } from '../db/schema'
import { readPrivacyRetentionSettings } from '../settings/privacy'
import type { QrCleanupLogger } from './qr-cleanup'

/**
 * Daily privacy retention job (`specs/14-nfr.md` §15.2, ADR-0014 decision 1–3,
 * WP-M10-15).
 *
 * Four data-minimisation steps run once a day at 03:30 server time: the reporter
 * contact fields of tickets closed outside the configured window become `NULL`,
 * the expired `ticket_photos` rows and their files below `UPLOAD_DIR` are removed,
 * the short spam-window rows of `report_throttle` and the year-old `bma_sync_runs`
 * rows are dropped. The steps are plain functions so a test can call them without
 * pg-boss; the scheduler is started only from the direct API start. Every step is
 * idempotent: a second run on the same day finds nothing left to delete. Only
 * aggregate counters are logged — never a ticket number, a name, a phone number
 * or an e-mail — and no append-only event row is ever edited.
 */

/** pg-boss queue name of the daily retention run. */
export const PRIVACY_RETENTION_QUEUE = 'privacy-retention'

/** One run per day, 03:30 server time. */
export const PRIVACY_RETENTION_CRON = '30 3 * * *'

/** Contact fields are anonymised in batches of this many tickets. */
export const PRIVACY_RETENTION_BATCH_SIZE = 500

/** `report_throttle` rows older than this many days are deleted (ADR-0014 decision 2). */
export const THROTTLE_RETENTION_DAYS = 30

/** `bma_sync_runs` rows older than this many days are deleted (ADR-0014 decision 3). */
export const SYNC_RUN_RETENTION_DAYS = 365

const DAY_MS = 24 * 60 * 60 * 1000

type Db = Database['database']

/**
 * Whole calendar months before `now`, clamped to the last day of the target
 * month so a window never moves later than the configured date.
 */
function monthsBefore(now: Date, months: number): Date {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()

  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(now.getUTCDate(), daysInTargetMonth),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  )
}

/** Closed tickets that still carry at least one reporter contact field. */
function anonymizableWhere(cutoff: Date) {
  const stillCarriesContactData = or(
    isNotNull(tickets.reporterName),
    isNotNull(tickets.reporterPhone),
    isNotNull(tickets.reporterEmail),
  )

  return and(lte(tickets.closedAt, cutoff), stillCarriesContactData)
}

/**
 * Sets `reporter_name`, `reporter_phone` and `reporter_email` to `NULL` for
 * tickets whose `closed_at` is at or before `cutoff`, `batchSize` tickets per
 * step. Open tickets (`closed_at IS NULL`) never match, the ticket row, its
 * events and its statistics stay. Returns how many tickets were anonymised.
 */
async function anonymizeClosedReporters(
  database: Db,
  cutoff: Date,
  batchSize = PRIVACY_RETENTION_BATCH_SIZE,
): Promise<number> {
  let anonymized = 0

  for (;;) {
    const rows = await database
      .select({ id: tickets.id })
      .from(tickets)
      .where(anonymizableWhere(cutoff))
      .limit(batchSize)

    if (rows.length === 0) {
      break
    }

    const ids = rows.map((row) => row.id)

    const updated = await database
      .update(tickets)
      .set({ reporterName: null, reporterPhone: null, reporterEmail: null })
      .where(inArray(tickets.id, ids))
      .returning({ id: tickets.id })

    anonymized += updated.length

    if (updated.length === 0 || rows.length < batchSize) {
      break
    }
  }

  return anonymized
}

export type PrivacyRetentionOptions = {
  uploadDir: string
  now?: Date
  batchSize?: number
}

export type PrivacyRetentionResult = {
  anonymized: number
  photosDeleted: number
  throttleDeleted: number
  syncRunsDeleted: number
}

/**
 * Deletes the `ticket_photos` rows of tickets closed at or before `cutoff` and
 * removes their files below `uploadDir`. A missing file is not an error, a path
 * that escapes the uploads volume is never touched. Returns the deleted rows.
 */
async function deleteExpiredPhotos(database: Db, uploadDir: string, cutoff: Date): Promise<number> {
  const rows = await database
    .select({ id: ticketPhotos.id, filePath: ticketPhotos.filePath })
    .from(ticketPhotos)
    .innerJoin(tickets, eq(ticketPhotos.ticketId, tickets.id))
    .where(lte(tickets.closedAt, cutoff))

  const volume = uploadDir + sep

  for (const row of rows) {
    const resolved = resolve(uploadDir, row.filePath)

    if (!resolved.startsWith(volume)) {
      continue
    }

    try {
      await rm(resolved, { force: true })
    } catch {
      // A missing or unreadable file never fails the run: the row is the data.
    }
  }

  if (rows.length === 0) {
    return 0
  }

  const deleted = await database
    .delete(ticketPhotos)
    .where(
      inArray(
        ticketPhotos.id,
        rows.map((row) => row.id),
      ),
    )
    .returning({ id: ticketPhotos.id })

  return deleted.length
}

/**
 * Drops `report_throttle` rows older than `THROTTLE_RETENTION_DAYS`: the request
 * IP exists only for the spam window and is never part of a ticket.
 */
async function deleteExpiredThrottleRows(database: Db, cutoff: Date): Promise<number> {
  const deleted = await database
    .delete(reportThrottle)
    .where(lte(reportThrottle.createdAt, cutoff))
    .returning({ id: reportThrottle.id })

  return deleted.length
}

/**
 * Drops `bma_sync_runs` rows older than `SYNC_RUN_RETENTION_DAYS`. Their
 * `conflicts` payloads carry object names, never reporter contact data.
 */
async function deleteExpiredSyncRunRows(database: Db, cutoff: Date): Promise<number> {
  const deleted = await database
    .delete(bmaSyncRuns)
    .where(lte(bmaSyncRuns.startedAt, cutoff))
    .returning({ id: bmaSyncRuns.id })

  return deleted.length
}

/**
 * Runs the four retention steps with the configured windows (24-month defaults)
 * and answers the aggregate counters. The retention settings are read inside so
 * a caller only has to pass the database and the uploads directory.
 */
export async function runPrivacyRetention(
  database: Db,
  options: PrivacyRetentionOptions,
): Promise<PrivacyRetentionResult> {
  const { uploadDir, now = new Date(), batchSize = PRIVACY_RETENTION_BATCH_SIZE } = options
  const windows = await readPrivacyRetentionSettings(database)

  const anonymized = await anonymizeClosedReporters(
    database,
    monthsBefore(now, windows.contactRetentionMonths),
    batchSize,
  )
  const photosDeleted = await deleteExpiredPhotos(
    database,
    uploadDir,
    monthsBefore(now, windows.photoRetentionMonths),
  )
  const throttleDeleted = await deleteExpiredThrottleRows(
    database,
    new Date(now.getTime() - THROTTLE_RETENTION_DAYS * DAY_MS),
  )
  const syncRunsDeleted = await deleteExpiredSyncRunRows(
    database,
    new Date(now.getTime() - SYNC_RUN_RETENTION_DAYS * DAY_MS),
  )

  return { anonymized, photosDeleted, throttleDeleted, syncRunsDeleted }
}

/**
 * Starts pg-boss, creates the `privacy-retention` queue, registers the worker and
 * the daily 03:30 schedule and returns the instance so the caller can `stop()`
 * it. Each run opens its own short-lived pool, so the worker never shares the
 * request pool, and logs the four counters only.
 */
export async function startPrivacyRetentionJob(
  connectionString: string,
  uploadDir: string,
  log?: QrCleanupLogger,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    // Message and stack only: pg-boss errors never carry credentials.
    log?.error({ err: error, queue: PRIVACY_RETENTION_QUEUE }, 'privacy retention job failed')
  })

  await boss.start()
  await boss.createQueue(PRIVACY_RETENTION_QUEUE)

  await boss.work(PRIVACY_RETENTION_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const { anonymized, photosDeleted, throttleDeleted, syncRunsDeleted } =
        await runPrivacyRetention(database, { uploadDir })

      log?.info(
        {
          queue: PRIVACY_RETENTION_QUEUE,
          anonymized,
          photosDeleted,
          throttleDeleted,
          syncRunsDeleted,
        },
        'privacy retention run finished',
      )
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(PRIVACY_RETENTION_QUEUE, PRIVACY_RETENTION_CRON)

  return boss
}
