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
import { readMinimumChannels } from '../settings/notifications'
import { ntfyRecipients } from './receivers'
import { effectiveNtfyConfig } from './verification'
import type { NtfyConfig } from './channels/ntfy'

/** The insert capability — enough for both the live database and a transaction node. */
type DbLike = Pick<Db, 'insert' | 'select'>

/** One notification queued for one channel — the insert shape of an `outbox` row. */
export interface OutboxRow {
  ticketId: string
  channel: string
  target: Record<string, unknown>
}

/**
 * The ticket facts an outbox row is created for. Only machine-readable message
 * parameters travel here: ticket number, priority, object name and its location,
 * system type, short text of the report and the AA/SA work order number. No
 * photo, no contact data (`PLAN.md` §12 message content, WP-M7-04, WP-M14-07).
 */
export interface OutboxTicket {
  id: string
  ticketNo: string
  priority: string
  objectName: string
  objectLocation?: string | null
  systemType?: string | null
  shortText?: string | null
  workOrderNo?: string | null
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
  objectLocation: ticket.objectLocation ?? null,
  systemType: ticket.systemType ?? null,
  shortText: ticket.shortText ?? null,
  workOrderNo: ticket.workOrderNo ?? null,
})

/**
 * The environment the adapters read: without an override the environment is
 * used as before; with an override the verified ntfy target replaces it and
 * `null` removes ntfy completely.
 */
function effectiveEnv(env: Env, ntfy: NtfyConfig | null | undefined): Env {
  if (ntfy === undefined) {
    return env
  }

  return { ...env, NTFY_URL: ntfy?.url ?? '', NTFY_TOPIC: ntfy?.topic ?? '' }
}

/**
 * Builds one `PENDING` row per configured channel. `state`, `attempts`,
 * `created_at` and `updated_at` come from the column defaults of migration 0019
 * — the enqueue never sets them, so draining (WP-M7-04b) reads them consistently.
 */
function outboxRows(
  ticket: OutboxTicket,
  env: Env,
  ntfy?: NtfyConfig | null,
): OutboxRow[] {
  const params = messageParams(ticket)

  return configuredChannels(effectiveEnv(env, ntfy)).map((channel) => ({
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

/** The priority an adapter may need — ntfy maps it to its own levels (WP-M14-07). */
export type MessagePriority = NotificationMessage & { priority?: string }

/** One param of the message body, or nothing when the stored row predates it. */
const param = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

/**
 * Builds the channel message from the machine-readable row params — ticket
 * number, priority, object name and location, system type, short text and the
 * AA/SA work order number — no photo, no contact data, no translated UI text
 * (`PLAN.md` §12; the `view` action label itself comes from i18n). Rows written
 * before WP-M14-07 lack the newer params; the missing values are simply skipped.
 */
export const messageOf = (target: Record<string, unknown>): MessagePriority => ({
  title: param(target.ticketNo),
  body: [
    target.priority,
    target.objectName,
    target.objectLocation,
    target.systemType,
    target.shortText,
    target.workOrderNo,
  ]
    .map(param)
    .filter((value) => value !== '')
    .join(' · '),
  priority: param(target.priority),
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
  ntfy?: NtfyConfig | null,
): Promise<OutboxDrainResult> {
  const channelsByName = new Map<string, NotificationChannel>(
    configuredChannels(effectiveEnv(env, ntfy)).map((channel) => [channel.name, channel]),
  )
  const chain = escalationChain(effectiveEnv(env, ntfy))
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
      // A per-user ntfy row carries its topic; every other adapter ignores the
      // option (WP-M14-45, `NotificationChannel.send`).
      const topic =
        typeof row.target.ntfyTopic === 'string' ? row.target.ntfyTopic : ''

      await channel.send(
        messageOf(row.target),
        topic === '' ? undefined : { topic },
      )
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
      // Only a verified ntfy target receives the rows; a channel that was
      // never confirmed is absent from the registry and its rows end `FAILED`.
      const ntfy = await effectiveNtfyConfig(database, env, { requireVerified: true })
      const { sent, failed, fallback, attempts } = await drainOutbox(database, env, log, ntfy)

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
 *
 * The ntfy target of `ticket.created` follows the selection of §11.4: a user
 * who selected `ntfy` for the event receives the row on the own topic
 * (`stoerdesk-<userId>` or the stored account topic, WP-M14-45) instead of the
 * instance topic. Without a selection the configured chain is written as before.
 *
 * A critical ticket additionally queues its mandatory minimum channels
 * (`notifications.minimum_channels`, WP-M14-18) on top of the user's selection;
 * a channel that is already queued for the ticket is not queued twice.
 */
export async function enqueueOutbox(
  database: DbLike,
  ticket: OutboxTicket,
  env: Env,
  eventType: string = 'ticket.created',
  ntfy?: NtfyConfig | null,
): Promise<number> {
  const ntfyConfigured =
    ntfy === undefined
      ? env.NTFY_URL !== '' && env.NTFY_TOPIC !== ''
      : ntfy !== null
  const recipients = ntfyConfigured ? await ntfyRecipients(database, eventType) : []

  const rows = outboxRows(ticket, env, ntfy).filter(
    (row) => row.channel !== 'ntfy' || recipients.length === 0,
  )

  for (const topic of recipients) {
    rows.push({
      ticketId: ticket.id,
      channel: 'ntfy',
      target: { ...messageParams(ticket), ntfyTopic: topic },
    })
  }

  if (ticket.priority === 'critical') {
    for (const channel of await readMinimumChannels(database)) {
      if (ntfy === null && channel === 'ntfy') {
        continue
      }

      if (!rows.some((row) => row.channel === channel)) {
        rows.push({ ticketId: ticket.id, channel, target: messageParams(ticket) })
      }
    }
  }

  if (rows.length === 0) {
    return 0
  }

  await database.insert(outbox).values(rows)

  return rows.length
}
