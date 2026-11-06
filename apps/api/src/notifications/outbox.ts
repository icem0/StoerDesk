import { PgBoss } from 'pg-boss'
import { and, eq, sql } from 'drizzle-orm'

import type { Env } from '../config/env'
import { createDatabase, type Database } from '../db/client'
import { outbox, ticketEvents } from '../db/schema'
import {
  configuredChannels,
  type NotificationChannel,
  type NotificationMessage,
} from './channels/index'
import type { QrCleanupLogger } from '../jobs/qr-cleanup'

/** The insert capability — enough for both the live database and a transaction node. */
type DbLike = Pick<Db, 'insert'>

/** One notification queued for one channel — the insert shape of an `outbox` row. */
export interface OutboxRow {
  ticketId: string
  channel: string
  target: Record<string, unknown>
}

/**
 * The ticket facts an outbox row is created for. Only machine-readable message
 * parameters travel here: ticket number, priority and object name. No photo, no
 * contact data (`PLAN.md` §12 message content, WP-M7-04).
 */
export interface OutboxTicket {
  id: string
  ticketNo: string
  priority: string
  objectName: string
}

/**
 * The message parameters every row of a ticket carries. They are never
 * translated text — status and priority stay English, the labels come from
 * i18n in the web layer (`PLAN.md` §3).
 */
const messageParams = (ticket: OutboxTicket): Record<string, unknown> => ({
  ticketNo: ticket.ticketNo,
  priority: ticket.priority,
  objectName: ticket.objectName,
})

/**
 * Builds one `PENDING` row per configured channel. `state`, `attempts`,
 * `created_at` and `updated_at` come from the column defaults of migration 0019
 * — the enqueue never sets them, so draining (WP-M7-04b) reads them consistently.
 */
function outboxRows(ticket: OutboxTicket, env: Env): OutboxRow[] {
  const params = messageParams(ticket)

  return configuredChannels(env).map((channel) => ({
    ticketId: ticket.id,
    channel: channel.name,
    target: params,
  }))
}

type Db = Database['database']

/** pg-boss queue name of the per-minute outbox drain. */
export const NOTIFICATION_OUTBOX_QUEUE = 'notification-outbox'

/** One drain run per minute. */
export const NOTIFICATION_OUTBOX_CRON = '* * * * *'

/** A row may be sent at most this many times before it becomes `FAILED`. */
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 3

/** Base backoff between retry attempts: `base · 2^(attempt - 1)`. */
export const NOTIFICATION_OUTBOX_RETRY_BACKOFF_MS = 300

/** One claimed outbox row, fresh from the atomic `UPDATE ... RETURNING` claim. */
export interface ClaimedOutboxRow {
  id: string
  ticketId: string
  channel: string
  target: Record<string, unknown>
  attempts: number
}

/**
 * Claims exactly one `PENDING` row — the oldest one — atomically: the single
 * `UPDATE` bumps `attempts` and only matches a row that is still `PENDING`,
 * so a concurrent drain can never pick the same row twice. Returns `undefined`
 * when nothing is pending.
 */
export async function claimOutboxRow(database: Db): Promise<ClaimedOutboxRow | undefined> {
  const [row] = await database
    .update(outbox)
    .set({
      attempts: sql`(${outbox.attempts} + 1)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outbox.state, 'PENDING'),
        sql`(${outbox.id} IN (SELECT id FROM outbox WHERE state = 'PENDING' ORDER BY created_at LIMIT 1))`,
      ),
    )
    .returning({
      id: outbox.id,
      ticketId: outbox.ticketId,
      channel: outbox.channel,
      target: outbox.target,
      attempts: outbox.attempts,
    })

  if (row === undefined) {
    return undefined
  }

  return {
    ...row,
    target: row.target as Record<string, unknown>,
  }
}

/** Aggregate counters of one drain run — never contact data. */
export interface OutboxDrainResult {
  sent: number
  failed: number
  fallback: number
  attempts: number
}

/**
 * The escalation chain of `PLAN.md` §12 ("3 retries with backoff, then the next
 * channel in the escalation chain"): the configured channel names in
 * `configuredChannels` order. A row whose channel is the last entry has no next
 * channel, so its retries end `FAILED` without a fallback.
 */
function escalationChain(env: Env): string[] {
  return configuredChannels(env).map((channel) => channel.name)
}

/**
 * Builds the channel message from the machine-readable row params — ticket
 * number, priority, object name — no photo, no contact data, no translated
 * UI text (`PLAN.md` §12; the `view` action label itself comes from i18n).
 */
const messageOf = (target: Record<string, unknown>): NotificationMessage => ({
  title: String(target.ticketNo ?? ''),
  body: `${String(target.priority ?? '')} · ${String(target.objectName ?? '')}`,
})

/**
 * Marks one row `SENT` or `FAILED` and appends exactly one
 * `notification_sent`/`notification_failed` event to the ticket history, both
 * in the same transaction. With a `fallbackChannel` the exhausted row
 * additionally queues one `PENDING` fallback row for the next channel of the
 * escalation chain — same ticket, same machine-readable `target` params, no
 * photo, no contact data. The pending guard of the same transaction makes
 * sure a channel that is still waiting for its own WP-M7-04 row is never
 * notified twice. Returns `true` only when a fallback row was really queued.
 */
async function finishRow(
  database: Db,
  row: ClaimedOutboxRow,
  state: 'SENT' | 'FAILED',
  eventType: 'notification_sent' | 'notification_failed',
  fallbackChannel?: string,
): Promise<boolean> {
  let fallbackQueued = false

  await database.transaction(async (tx) => {
    if (fallbackChannel !== undefined) {
      const pending = await tx
        .select({ channel: outbox.channel })
        .from(outbox)
        .where(and(eq(outbox.ticketId, row.ticketId), eq(outbox.state, 'PENDING')))

      const alreadyPending = pending.some((candidate) => candidate.channel === fallbackChannel)

      if (!alreadyPending) {
        await tx.insert(outbox).values({
          ticketId: row.ticketId,
          channel: fallbackChannel,
          target: row.target,
        })

        fallbackQueued = true
      }
    }

    await tx.update(outbox).set({ state, updatedAt: new Date() }).where(eq(outbox.id, row.id))

    await tx.insert(ticketEvents).values({
      ticketId: row.ticketId,
      type: eventType,
      actorKind: 'system',
      payload: {
        channel: row.channel,
        ticketNo: String(row.target.ticketNo ?? ''),
        attempts: row.attempts,
      },
    })
  })

  return fallbackQueued
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Drains the notification outbox oldest first: claims one row at a time,
 * sends it through the channel named by the row, retries up to
 * `NOTIFICATION_OUTBOX_MAX_ATTEMPTS` times with backoff and writes `SENT` /
 * `FAILED` plus the `notification_sent` / `notification_failed` event per row.
 * An exhausted row falls back to the next channel of the escalation chain
 * (`PLAN.md` §12, WP-M7-05): a `PENDING` fallback row for that channel is
 * queued unless the ticket already has a pending row there, and the drain
 * loop claims it in the same run — the chain length bounds the run.
 * A row whose channel name is no longer configured ends `FAILED`.
 */
export async function drainOutbox(
  database: Db,
  env: Env,
  log?: QrCleanupLogger,
): Promise<OutboxDrainResult> {
  const channelsByName = new Map<string, NotificationChannel>(
    configuredChannels(env).map((channel) => [channel.name, channel]),
  )
  const chain = escalationChain(env)
  const result: OutboxDrainResult = { sent: 0, failed: 0, fallback: 0, attempts: 0 }

  while (true) {
    const row = await claimOutboxRow(database)

    if (row === undefined) {
      return result
    }

    result.attempts += 1

    const channel = channelsByName.get(row.channel)
    const ticketNo = String(row.target.ticketNo ?? '')

    if (channel === undefined) {
      await finishRow(database, row, 'FAILED', 'notification_failed')

      log?.warn(
        {
          queue: NOTIFICATION_OUTBOX_QUEUE,
          channel: row.channel,
          ticketNo,
          attempts: row.attempts,
          code: 'channel_unconfigured',
        },
        'notification channel not configured',
      )

      result.failed += 1
      continue
    }

    try {
      await channel.send(messageOf(row.target))
      await finishRow(database, row, 'SENT', 'notification_sent')

      result.sent += 1
    } catch (error) {
      log?.warn(
        {
          queue: NOTIFICATION_OUTBOX_QUEUE,
          channel: row.channel,
          ticketNo,
          attempts: row.attempts,
          code: 'channel_send_failed',
          err: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        'notification send failed',
      )
      if (row.attempts >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS) {
        const nextChannel = chain.at(chain.indexOf(row.channel) + 1)
        const fallbackQueued = await finishRow(
          database,
          row,
          'FAILED',
          'notification_failed',
          nextChannel,
        )

        if (fallbackQueued) {
          log?.info(
            {
              queue: NOTIFICATION_OUTBOX_QUEUE,
              channel: row.channel,
              ticketNo,
              attempts: row.attempts,
              code: 'channel_fallback',
            },
            'notification escalated to next channel',
          )

          result.fallback += 1
        } else {
          result.failed += 1
        }
      } else {
        // The row stays `PENDING`; the next loop iteration claims it again.
        await sleep(NOTIFICATION_OUTBOX_RETRY_BACKOFF_MS * 2 ** (row.attempts - 1))
      }
    }
  }
}

/**
 * Starts pg-boss, creates the outbox drain queue, registers the worker and the
 * per-minute schedule; returns the instance so the caller can `stop()` it.
 * Each run opens its own short-lived pool, so the worker never shares the
 * request pool — `buildServer()` stays job-free.
 */
export async function startNotificationOutboxJob(
  connectionString: string,
  env: Env,
  log?: QrCleanupLogger,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    // Message and stack only: pg-boss errors never carry credentials.
    log?.error(
      { err: { message: error.message, stack: error.stack }, queue: NOTIFICATION_OUTBOX_QUEUE },
      'notification outbox job failed',
    )
  })

  await boss.start()
  await boss.createQueue(NOTIFICATION_OUTBOX_QUEUE)

  await boss.work(NOTIFICATION_OUTBOX_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const { sent, failed, fallback, attempts } = await drainOutbox(database, env, log)

      log?.info(
        { queue: NOTIFICATION_OUTBOX_QUEUE, sent, failed, fallback, attempts },
        'notification outbox drain finished',
      )
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(NOTIFICATION_OUTBOX_QUEUE, NOTIFICATION_OUTBOX_CRON)

  log?.info(
    { queue: NOTIFICATION_OUTBOX_QUEUE, cron: NOTIFICATION_OUTBOX_CRON },
    'notification outbox job scheduled',
  )

  return boss
}

/**
 * Writes the notification outbox rows for a freshly created ticket, inside the
 * same transaction the caller is in. It only inserts — there is deliberately no
 * HTTP call, so a channel failure can never lose the ticket event (`PLAN.md` §12).
 * Returns the number of rows written; an unconfigured environment writes none.
 */
export async function enqueueOutbox(
  database: DbLike,
  ticket: OutboxTicket,
  env: Env,
): Promise<number> {
  const rows = outboxRows(ticket, env)

  if (rows.length === 0) {
    return 0
  }

  await database.insert(outbox).values(rows)

  return rows.length
}
