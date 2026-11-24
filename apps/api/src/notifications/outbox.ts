import { PgBoss } from 'pg-boss'
import { and, eq, sql, type SQL } from 'drizzle-orm'

import type { Env } from '../config/env'
import { createDatabase, type Database } from '../db/client'
import {
  notificationMessages,
  oncallPools,
  outbox,
  ticketEvents,
  users,
} from '../db/schema'
import { ONCALL_TIMEZONE, t } from '@stoerdesk/shared'
import type { NotificationChannelKind, NotificationEventType } from '@stoerdesk/shared'
import {
  configuredChannels,
  type MessageOptions,
  type NotificationChannel,
  type NotificationMessage,
} from './channels/index'
import type { QrCleanupLogger } from '../jobs/qr-cleanup'
import { readAccountSecret } from './accounts'
import { personalRecipients } from './receivers'
import { effectiveNtfyConfig } from './verification'
import { CHANNEL_HEALTH_WARNING_EVENT, enqueueChannelHealthWarnings } from './health'
import type { NtfyConfig } from './channels/ntfy'

/** The insert capability — enough for both the live database and a transaction node. */
type DbLike = Pick<Db, 'insert' | 'select'>

/** One notification queued for one channel — the insert shape of an `outbox` row. */
export interface OutboxRow {
  /** Null for a readiness row of the on-call calendar (ADR-0021, WP-M14-27). */
  ticketId: string | null
  /** Set for a readiness row of the on-call calendar (ADR-0021, WP-M14-28). */
  shiftId?: string | null
  /** The event the row announces; ticket rows keep `ticket.created` by default. */
  eventType?: string
  channel: string
  target: Record<string, unknown>
  /** The personal message of this delivery (WP-M14-120b). */
  notificationMessageId?: string
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

/** One on-call shift as the readiness enqueue path needs it. */
export interface OutboxShift {
  id: string
  poolId: string
  state: string
  startsAt: Date
  endsAt: Date
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
 * `null` removes ntfy completely. The access token of the target follows the
 * same rule (ADR-0022, WP-M14-51): the write-only `secret` of the row already
 * resolved into `ntfy.token`, so the drain never loses the key of a
 * self-hosted ntfy server.
 */
function effectiveEnv(env: Env, ntfy: NtfyConfig | null | undefined): Env {
  if (ntfy === undefined) {
    return env
  }

  return {
    ...env,
    NTFY_URL: ntfy?.url ?? '',
    NTFY_TOPIC: ntfy?.topic ?? '',
    NTFY_TOKEN: ntfy?.token ?? env.NTFY_TOKEN,
  }
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

/** pg-boss queue name of the daily health check of the channels (§11.15). */
export const NOTIFICATION_HEALTH_QUEUE = 'notification-health'

/** One health check per day, 04:00 server time. */
export const NOTIFICATION_HEALTH_CRON = '0 4 * * *'

/** A row may be sent at most this many times before it becomes `FAILED`. */
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 3

/** Base backoff between retry attempts: `base · 2^(attempt - 1)`. */
export const NOTIFICATION_OUTBOX_RETRY_BACKOFF_MS = 300

/** One claimed outbox row, fresh from the atomic `UPDATE ... RETURNING` claim. */
export interface ClaimedOutboxRow {
  id: string
  /** Null for a readiness row of the on-call calendar (ADR-0021, WP-M14-27). */
  ticketId: string | null
  /** Set for a readiness row of the on-call calendar (ADR-0021, WP-M14-28). */
  shiftId: string | null
  channel: string
  target: Record<string, unknown>
  eventType: string
  attempts: number
  /** The personal message of this delivery (WP-M14-120b); null for an instance row. */
  notificationMessageId: string | null
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
      shiftId: outbox.shiftId,
      channel: outbox.channel,
      target: outbox.target,
      eventType: outbox.eventType,
      attempts: outbox.attempts,
      notificationMessageId: outbox.notificationMessageId,
    })

  if (row === undefined) {
    return undefined
  }

  return {
    ...row,
    shiftId: row.shiftId ?? null,
    target: row.target as Record<string, unknown>,
    eventType: row.eventType ?? 'ticket.created',
    notificationMessageId: row.notificationMessageId ?? null,
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
export type MessagePriority = NotificationMessage & {
  priority?: string
  /** The ntfy level selected on an escalation action (WP-M14-89). */
  ntfyPriority?: number
}

/**
 * The deep link into the ticket of §11.5: the ticket detail page of the PWA
 * (`/tickets/:ticketNo` in `apps/web/src/routes/index.tsx`). The link carries
 * the ticket number only — never a `status_token`, never contact data, never a
 * credential (as in WP-M14-22). Without a PWA url or without a ticket number
 * there is no link and the channel keeps its PWA-root fallback (WP-M14-68).
 */
export function ticketDeepLink(pwaUrl: string, ticketNo: string): string {
  if (pwaUrl === '' || ticketNo === '') {
    return ''
  }

  return `${pwaUrl.replace(/\/+$/, '')}/tickets/${encodeURIComponent(ticketNo)}`
}

/** The deep link into the on-call calendar of §11.5: `/oncall` of the PWA. */
export function oncallDeepLink(pwaUrl: string): string {
  if (pwaUrl === '') {
    return ''
  }

  return `${pwaUrl.replace(/\/+$/, '')}/oncall`
}

/** One param of the message body, or nothing when the stored row predates it. */
const param = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

/**
 * The message of a warning of a broken channel (§11.15, ADR-0028): the title
 * names the broken channel, the body the translated sentence with the channel
 * and the machine code of its last failure. It is the only message of the
 * outbox that carries translated text — it announces the state of a channel and
 * not the state of a ticket. The locale is the reference locale of the server
 * (`PLAN.md` §3.1); the text carries no emergency number (`PLAN.md` §2).
 */
const healthWarningMessageOf = (target: Record<string, unknown>): MessagePriority => {
  const channel = param(target.channel)
  const code = param(target.code)

  return {
    title: t('de', `notification.channels.${channel}`),
    body: t('de', 'notification.channel_health_warning', { channel: t('de', `notification.channels.${channel}`), code }),
  }
}

/**
 * Builds the channel message from the machine-readable row params — ticket
 * number, priority, object name and location, system type, short text and the
 * AA/SA work order number — no photo, no contact data, no translated UI text
 * (`PLAN.md` §12; the `view` action label itself comes from i18n). Rows written
 * before WP-M14-07 lack the newer params; the missing values are simply skipped.
 * A readiness row (`shift_id`) carries the pool name, the start and end in
 * `Europe/Berlin` formatted from the stored UTC values and the shift state;
 * it never touches the ticket fields of §11.5. A warning of a broken channel
 * (`channel_health_warning`) carries the translated sentence of §11.15.
 */
export const messageOf = (target: Record<string, unknown>, eventType = ''): MessagePriority => {
  if (target.shiftId !== undefined && target.shiftId !== null) {
    return readinessMessageOf(target)
  }

  if (eventType === CHANNEL_HEALTH_WARNING_EVENT) {
    return healthWarningMessageOf(target)
  }

  return ticketMessageOf(target)
}

/**
 * The kind of a message (§11.5a): the template of the e-mail is chosen by it —
 * a ticket message, a readiness message or a test message. The machine values
 * of the message travel with it, so the template can fill its placeholders.
 */
export const messageKindOf = (
  target: Record<string, unknown>,
  eventType = '',
): 'ticket' | 'readiness' | 'test' => {
  if (eventType === 'channel_health_warning') {
    return 'test'
  }

  return target.shiftId !== undefined && target.shiftId !== null ? 'readiness' : 'ticket'
}

/**
 * The `Europe/Berlin` rendering of a stored UTC instant for a readiness
 * message. `de-DE` keeps the machine-readable short form consistent with the
 * web UI (`WP-M14-28`, §11.5).
 */
const berlinTime = (value: unknown): string => {
  if (value === undefined || value === null) {
    return ''
  }

  return new Intl.DateTimeFormat('de-DE', {
    timeZone: ONCALL_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(String(value)))
}

/** The ticket message of §11.5 (machine values only). */
const ticketMessageOf = (target: Record<string, unknown>): MessagePriority => ({
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
  ...(typeof target.ntfyPriority === 'number' ? { ntfyPriority: target.ntfyPriority } : {}),
})

/** The readiness message of §11.5 (machine values only). */
const readinessMessageOf = (target: Record<string, unknown>): MessagePriority => ({
  title: param(target.poolName),
  body: [
    param(target.state),
    `${berlinTime(target.startsAt)} – ${berlinTime(target.endsAt)}`,
  ]
    .filter((value) => value !== '')
    .join(' · '),
  priority: '',
})

/**
 * The name of the addressee of a personal message (`specs/10-notifications.md`
 * §11.16, WP-M14-152a): given and family name, the e-mail only as the fallback
 * — the same rule the inbox of the administrator answers. An instance row
 * without a personal message has no addressee.
 */
async function recipientNameOf(
  database: DbLike,
  messageId: string | null,
): Promise<string | null> {
  if (messageId === null) {
    return null
  }

  const [message] = await database
    .select({ userId: notificationMessages.userId })
    .from(notificationMessages)
    .where(eq(notificationMessages.id, messageId))

  if (message === undefined || !message.userId) {
    return null
  }

  const [user] = await database
    .select({ givenName: users.givenName, familyName: users.familyName, email: users.email })
    .from(users)
    .where(eq(users.id, message.userId))

  if (user === undefined) {
    return null
  }

  const name = `${user.givenName} ${user.familyName}`.trim()

  return name === '' ? user.email : name
}

/**
 * The user of a personal message (`specs/10-notifications.md` §11.4, ADR-0045):
 * the drain needs him to read the write-only secret of his account (the Matrix
 * token) and to send the web push only to his devices. A row without a message
 * is a row of the installation and has no user.
 */
async function messageUserId(database: DbLike, messageId: string | null): Promise<string | null> {
  if (messageId === null) {
    return null
  }

  const [message] = await database
    .select({ userId: notificationMessages.userId })
    .from(notificationMessages)
    .where(eq(notificationMessages.id, messageId))

  return message?.userId ?? null
}

/**
 * Marks one row `SENT` or `FAILED` and appends exactly one
 * `notification_sent`/`notification_failed` event to the ticket history, both
 * in the same transaction. With a `fallbackChannel` the exhausted row
 * additionally queues one `PENDING` fallback row for the next channel of the
 * escalation chain — same ticket, same machine-readable `target` params, no
 * photo, no contact data. The pending guard of the same transaction makes
 * sure a channel that is still waiting for its own WP-M7-04 row is never
 * notified twice. Returns `true` only when a fallback row was really queued.
 *
 * Next to the channel the event names the configuration that queued the row
 * (§11.8, WP-M14-152a): the rule and the stage of the escalation, the target
 * the action was configured for and the addressee of a personal delivery —
 * display names only, never a topic, a token, an address or a contact value.
 */
async function finishRow(
  database: Db,
  row: ClaimedOutboxRow,
  state: 'SENT' | 'FAILED',
  eventType: 'notification_sent' | 'notification_failed',
  fallbackChannel?: string,
  errorCode?: string,
): Promise<boolean> {
  let fallbackQueued = false

  await database.transaction(async (tx) => {
    if (fallbackChannel !== undefined) {
      const fallbackConditions: SQL<unknown>[] = [eq(outbox.state, 'PENDING')]

      if (row.ticketId !== null) {
        fallbackConditions.push(eq(outbox.ticketId, row.ticketId))
      } else {
        fallbackConditions.push(eq(outbox.shiftId, row.shiftId ?? ''))
        fallbackConditions.push(eq(outbox.eventType, row.eventType))
      }

      const pending = await tx
        .select({ channel: outbox.channel })
        .from(outbox)
        .where(and(...fallbackConditions))

      const alreadyPending = pending.some((candidate) => candidate.channel === fallbackChannel)

      if (!alreadyPending) {
        await tx.insert(outbox).values({
          ticketId: row.ticketId ?? null,
          shiftId: row.shiftId ?? null,
          eventType: row.eventType,
          channel: fallbackChannel,
          target: row.target,
        })

        fallbackQueued = true
      }
    }

    if (errorCode !== undefined) {
      await tx
        .update(outbox)
        .set({
          state,
          updatedAt: new Date(),
          target: { ...row.target, lastError: errorCode } as Record<string, unknown>,
        })
        .where(eq(outbox.id, row.id))
    } else {
      await tx.update(outbox).set({ state, updatedAt: new Date() }).where(eq(outbox.id, row.id))
    }

    if (row.ticketId !== null) {
      const rule = row.target.escalationRule
      const stage = row.target.escalationStage
      const targetName = row.target.targetName
      const recipient = await recipientNameOf(tx, row.notificationMessageId)

      await tx.insert(ticketEvents).values({
        ticketId: row.ticketId,
        type: eventType,
        actorKind: 'system',
        payload: {
          channel: row.channel,
          ticketNo: String(row.target.ticketNo ?? ''),
          attempts: row.attempts,
          ...(typeof rule === 'string' ? { rule } : {}),
          ...(typeof stage === 'string' ? { stage } : {}),
          ...(typeof targetName === 'string' ? { target: targetName } : {}),
          ...(recipient !== null ? { recipient } : {}),
          ...(errorCode !== undefined ? { errorCode } : {}),
        },
      })
    }
  })

  return fallbackQueued
}

/**
 * Flips the state of the personal message of a row (WP-M14-120b): the message
 * follows its delivery — `SENT` when the channel took it, `FAILED` when the
 * delivery failed. An instance-chain row carries no message and changes
 * nothing.
 */
async function finishMessage(
  database: Db,
  row: ClaimedOutboxRow,
  state: 'SENT' | 'FAILED',
): Promise<void> {
  if (row.notificationMessageId === null) {
    return
  }

  await database
    .update(notificationMessages)
    .set({ state })
    .where(eq(notificationMessages.id, row.notificationMessageId))
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
    const isShiftRow = row.shiftId !== null && row.shiftId !== undefined
    const ticketNo = isShiftRow ? '' : String(row.target.ticketNo ?? '')

    if (channel === undefined) {
      await finishRow(database, row, 'FAILED', 'notification_failed', undefined, 'channel_unconfigured')

      await finishMessage(database, row, 'FAILED')

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
      // A per-user ntfy row carries its topic; the ticket rows carry the deep
      // link into the ticket of §11.5 (WP-M14-68) and the readiness rows the
      // link into the on-call calendar (WP-M14-28). Every channel of the chain
      // gets the link of the row it sends, so a fallback row keeps the same
      // ticket link. An older row without `ticketNo` keeps the PWA root.
      const recipientTarget =
        typeof row.target.recipientTarget === 'string' ? row.target.recipientTarget : ''
      const topic =
        typeof row.target.ntfyTopic === 'string' && row.target.ntfyTopic !== ''
          ? row.target.ntfyTopic
          : row.channel === 'ntfy'
            ? recipientTarget
            : ''
      const deepLink = isShiftRow
        ? oncallDeepLink(env.PWA_URL)
        : ticketDeepLink(env.PWA_URL, ticketNo)
      const options: MessageOptions = {}

      if (topic !== '') {
        options.topic = topic
      }

      if (deepLink !== '') {
        options.deepLink = deepLink
      }

      // The target of the user (ADR-0045): the row of a personal delivery names
      // the address of the user, the drain reads the write-only secret of his
      // account (the Matrix token) from the account itself — the secret never
      // enters the row of the outbox (§11.13).
      if (recipientTarget !== '') {
        options.recipientTarget = recipientTarget
      }

      const userId = await messageUserId(database, row.notificationMessageId)

      if (userId !== null) {
        options.userId = userId

        const secret = await readAccountSecret(database, userId, row.channel)

        if (secret !== '') {
          options.recipientSecret = secret
        }
      }

      await channel.send(
        { ...messageOf(row.target, row.eventType), kind: messageKindOf(row.target, row.eventType), params: row.target },
        options,
      )
      await finishRow(database, row, 'SENT', 'notification_sent')

      await finishMessage(database, row, 'SENT')

      result.sent += 1
    } catch (error) {
      const errorCode =
        error instanceof Error &&
        typeof (error as unknown as { code?: unknown }).code === 'string'
          ? (error as unknown as { code: string }).code
          : 'send_failed'

      log?.warn(
        {
          queue: NOTIFICATION_OUTBOX_QUEUE,
          channel: row.channel,
          ticketNo,
          attempts: row.attempts,
          code: errorCode,
          err: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        'notification send failed',
      )
      if (row.attempts >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS) {
        // A warning of a broken channel never falls back (§11.15): the warning
        // is the last word about the channel, a fallback of the warning would
        // only hide the failure behind a second failure.
        const nextChannel =
          row.eventType === CHANNEL_HEALTH_WARNING_EVENT
            ? undefined
            : chain.at(chain.indexOf(row.channel) + 1)
        const fallbackQueued = await finishRow(
          database,
          row,
          'FAILED',
          'notification_failed',
          nextChannel,
          errorCode,
        )

        await finishMessage(database, row, 'FAILED')

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

  // The daily health check (§11.15, ADR-0028): it names the broken channels and
  // writes one warning row per broken channel over another channel — at most
  // one per channel and per day. The check reads the rows of the outbox, it
  // never pushes a message into a browser.
  await boss.createQueue(NOTIFICATION_HEALTH_QUEUE)

  await boss.work(NOTIFICATION_HEALTH_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const warnings = await enqueueChannelHealthWarnings(database, env)

      log?.info({ queue: NOTIFICATION_HEALTH_QUEUE, warnings }, 'notification health check finished')
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(NOTIFICATION_HEALTH_QUEUE, NOTIFICATION_HEALTH_CRON)

  log?.info(
    { queue: NOTIFICATION_HEALTH_QUEUE, cron: NOTIFICATION_HEALTH_CRON },
    'notification health job scheduled',
  )

  return boss
}

/**
 * One personal delivery of the internal notification layer (WP-M14-120b): the
 * message for a user and the outbox row that carries it to its channel. The
 * message is recorded before it leaves, so the inbox can show what went to
 * which channel and whether it arrived.
 */
export interface PersonalDelivery {
  /** The addressee of the message. */
  userId: string
  channel: string
  eventType: string
  /** The title of the message — the ticket number or the pool name. */
  title: string
  /** The body of the message — the machine-readable params of §11.5. */
  body: string
  /** Exactly one of the two: the ticket of the row or the readiness shift. */
  ticketId?: string | null
  shiftId?: string | null
  /** The machine-readable params of the row (§11.5). */
  target: Record<string, unknown>
}

/**
 * Writes the message row of every personal delivery and the outbox row next to
 * it: the outbox row points at its message, so the drain flips the state of
 * the message to `SENT` or `FAILED` and the inbox shows the outcome. An
 * instance-chain row (a delivery without a single addressee) is written by the
 * caller and carries no message.
 *
 * Returns the number of the written outbox rows.
 */
export async function enqueuePersonalDeliveries(
  database: DbLike,
  deliveries: readonly PersonalDelivery[],
): Promise<number> {
  if (deliveries.length === 0) {
    return 0
  }

  const messages = await database
    .insert(notificationMessages)
    .values(
      deliveries.map((delivery) => ({
        userId: delivery.userId,
        channel: delivery.channel,
        eventType: delivery.eventType,
        state: 'PENDING',
        title: delivery.title,
        body: delivery.body,
      })),
    )
    .returning({ id: notificationMessages.id })

  await database.insert(outbox).values(
    deliveries.map((delivery, index) => ({
      ticketId: delivery.ticketId ?? null,
      shiftId: delivery.shiftId ?? null,
      eventType: delivery.eventType,
      channel: delivery.channel,
      target: delivery.target,
      notificationMessageId: messages[index]?.id,
    })),
  )

  return deliveries.length
}

/**
 * Writes the notification outbox rows for a freshly created ticket, inside the
 * same transaction the caller is in. It only inserts — there is deliberately no
 * HTTP call, so a channel failure can never lose the ticket event (`PLAN.md` §12).
 * Returns the number of rows written; an unconfigured environment writes none.
 *
 * The rows of the new ticket go to the **channels of the installation** — the
 * chain of §11.1 — the way the office is reached (ADR-0045). The channels of a
 * *user* carry the messages that name him: the assignment, the answer of the
 * assignment, the escalation that addresses him and the readiness of his shift
 * (`enqueuePersonalDeliveries`). The former selection per event type and the
 * mandatory channels of the critical tickets are gone: the rule of the
 * administration says what a user must have set up (§11.9), it does not decide
 * the way of a message.
 */
export async function enqueueOutbox(
  database: DbLike,
  ticket: OutboxTicket,
  env: Env,
  _eventType: string = 'ticket.created',
  ntfy?: NtfyConfig | null,
): Promise<number> {
  const rows = outboxRows(ticket, env, ntfy)

  if (rows.length === 0) {
    return 0
  }

  await database.insert(outbox).values(rows)

  return rows.length
}

/**
 * Writes the notification outbox rows for a readiness shift inside the
 * transaction the caller is in. One `PENDING` row is written per selected
 * channel of the technician (`notification_preferences` for `eventType`);
 * without a selection the configured instance chain of §11.1 is used. A
 * second call while a row for the same shift and event is still `PENDING`
 * writes no additional row (`ADR-0021`, WP-M14-28). Returns the number of
 * rows written; an unconfigured environment writes none.
 */
export async function enqueueOncallOutbox(
  database: DbLike,
  { shift, eventType, userId }: {
    shift: OutboxShift
    eventType: NotificationEventType
    userId: string
  },
  env: Env,
): Promise<number> {
  const [pool] = await database
    .select({ poolName: oncallPools.name })
    .from(oncallPools)
    .where(eq(oncallPools.id, shift.poolId))
    .limit(1)

  if (pool === undefined) {
    throw new Error('oncall_pool_not_found')
  }

  const target: Record<string, unknown> = {
    poolName: pool.poolName,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    state: shift.state,
    shiftId: shift.id,
  }

  // The channels of the technician (§11.4, ADR-0045): his confirmed
  // accounts and his web-push devices. Without a confirmed channel the message
  // goes over the chain of the installation — the fallback of §11.7: a message
  // never stays in the queue because a user has no channel of his own.
  const personal = await personalRecipients(database, [userId])
  const channels =
    personal.length > 0
      ? personal
      : configuredChannels(env).map((channel) => ({
          userId,
          channel: channel.name as NotificationChannelKind,
          target: '',
        }))

  const pending = await database
    .select({ channel: outbox.channel })
    .from(outbox)
    .where(
      and(
        eq(outbox.shiftId, shift.id),
        eq(outbox.eventType, eventType),
        eq(outbox.state, 'PENDING'),
      ),
    )

  const pendingChannels = new Set(pending.map((row) => row.channel))

  // Personal deliveries for the readiness of the technician (WP-M14-120b): each
  // channel gets a message row next to the outbox row, so the inbox of the
  // technician shows the message and its state.
  const deliveries: PersonalDelivery[] = []

  for (const channel of channels) {
    if (pendingChannels.has(channel.channel)) {
      continue
    }

    const rowTarget: Record<string, unknown> = { ...target }

    if (channel.target !== '') {
      rowTarget.recipientTarget = channel.target
    }

    if (channel.channel === 'ntfy' && channel.target !== '') {
      rowTarget.ntfyTopic = channel.target
    }

    deliveries.push({
      userId,
      channel: channel.channel,
      eventType,
      title: String(target.poolName ?? ''),
      body: [
        String(target.state ?? ''),
        String(target.startsAt ?? ''),
        String(target.endsAt ?? ''),
      ]
        .filter((value) => value !== '')
        .join(' · '),
      shiftId: shift.id,
      target: rowTarget,
    })
  }

  if (deliveries.length === 0) {
    return 0
  }

  await enqueuePersonalDeliveries(database, deliveries)

  return deliveries.length
}
