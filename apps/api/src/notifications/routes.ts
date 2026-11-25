import fp from 'fastify-plugin'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  PERMISSIONS,
  t,
  acknowledgeDeliveryRequestSchema,
  acknowledgeDeliveryResponseSchema,
  channelConfigurationListResponseSchema,
  channelConfigurationSchema,
  channelStatusListResponseSchema,
  deliveryProblemsResponseSchema,
  emailAccountRequestSchema,
  channelVerificationResponseSchema,
  confirmChannelVerificationRequestSchema,
  confirmNotificationVerificationRequestSchema,
  confirmChannelVerificationResponseSchema,
  channelTestRequestSchema,
  channelTestResponseSchema,
  matrixLinkingRequestSchema,
  notificationAccountSchema,
  notificationDeliveryAttemptFilterSchema,
  notificationDeliveryAttemptListResponseSchema,
  notificationComplianceListResponseSchema,
  notificationUserComplianceSchema,
  notificationAccountListResponseSchema,
  notificationChannelKindSchema,
  notificationItemFilterSchema,
  notificationItemListResponseSchema,
  notificationItemReadResponseSchema,
  notificationUnreadCountResponseSchema,
  notificationVerificationResponseSchema,
  notificationDeliveryListResponseSchema,
  alarmSettingsSchema,
  notificationMuteSchema,
  deliveryLogQuerySchema,
  redeemTelegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
  type ChannelConfiguration,
  type UpdateChannelConfigurationRequest,
  updateChannelConfigurationRequestSchema,
  webPushConfigResponseSchema,
  webPushSubscriptionCheckRequestSchema,
  webPushSubscriptionCheckResponseSchema,
  webPushSubscriptionRequestSchema,
  webPushSubscriptionResponseSchema,
  webPushUnsubscribeRequestSchema,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { preHandlerHookHandler } from 'fastify'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import {
  notificationChannels,
  notificationAccounts,
  outbox,
  pushSubscriptions,
} from '../db/schema'
import { configuredChannels, type NotificationChannel } from './channels'
import { resolveChannelStatus } from '../dashboard/service'
import { readChannelConfiguration } from './config'
import {
  ChannelVerificationError,
  confirmNtfyVerification,
  effectiveNtfyConfig,
  requestNtfyVerification,
} from './verification'
import { deleteAccount, listAccounts, storeAccount } from './accounts'
import { readCompliance, readUserComplianceWithPolicy } from './compliance'
import { readAlarmSettings } from '../settings/notifications'
import { muteForOneHour, readMuteUntil } from './mute'
import {
  ConfirmationError,
  confirmChannelConfirmation,
  requestChannelConfirmation,
} from './confirmation'
import { acknowledgeDeliveryProblems, readDeliveryProblems } from './delivery'
import {
  countWebPushSubscriptions,
  deleteWebPushSubscription,
  hasWebPushSubscription,
  readWebPushPublicKey,
  storeWebPushSubscription,
} from './web-push-subscriptions'
import {
  readDeliveries,
  readDeliveryRecipients,
} from './messages'
import { countUnreadItems, markItemRead, readItems } from './items'
import {
  storeMatrixAccount,
  MatrixLinkingError,
  type MatrixLinkingErrorCode,
} from './matrix-linking'
import {
  readBridgeStatus,
  storeWhatsAppAccount,
  WhatsAppLinkingError,
  type BridgeConfig,
  type WhatsAppLinkingErrorCode,
} from './whatsapp-linking'
import {
  createTelegramCode,
  redeemTelegramCode,
  TelegramLinkingError,
  type TelegramLinkingErrorCode,
} from './telegram-linking'

/**
 * Admin channel configuration routes, the Telegram, the Matrix and the WhatsApp
 * Web account linking routes, the removal of an own account and the selection of
 * the channels per event type of the session user
 * (`specs/10-notifications.md` §11.2, §11.3, §11.4, §11.6, §11.11, WP-M14-05,
 * WP-M14-09, WP-M14-11, WP-M14-15, WP-M14-16). The list is the effective
 * configuration of
 * `readChannelConfiguration` and never carries a secret; the write reports `secretSet`
 * only. A failing test send is a regular answer with `delivered: false` and the adapter
 * code, never an HTTP error of the administration. The linking routes are session-only:
 * the bot token, the Matrix access token and the bridge bearer of WhatsApp Web never
 * enter an answer, a log or an error message. `GET /api/v1/notifications/accounts/whatsapp/status`
 * answers the chats of the bridge (`readBridgeStatus` of §11.6) — an unreachable
 * bridge answers `{ connected: false, chats: [] }`, never an error — and `POST
 * /api/v1/notifications/accounts/whatsapp` stores the picked chat id as the account
 * of the user, a chat the bridge does not know is a `422 invalid_request`.
 * `GET` and `PUT /api/v1/notifications/preferences` (§11.4, §11.11, WP-M14-16)
 * answer and replace the selection of the session user; the seven event types
 * of §11.4 and the channel kinds of §11.1 are the only accepted values — an
 * unknown event type or channel is a `422 invalid_request` and writes nothing.
 * `GET /api/v1/notifications/status` (§11.8, §11.11, WP-M14-19) answers the pending
 * rows, the failed rows, the last success and the last failure per channel over
 * the same outbox rows the dashboard tile reads — a failing channel is a warning
 * for the administration, never an error of the API.
 */

type Db = Database['database']

export type NotificationChannelRoutesOptions = {
  database: Db
  env: Env
  /** Test seam: the adapters of the registry; defaults to `configuredChannels(env)`. */
  channels?: readonly NotificationChannel[]
  /** Test seam: the transport of the Bot API `getUpdates`; defaults to `fetch`. */
  telegramFetch?: typeof fetch
  /** Test seam: the transport of the homeserver `whoami`; defaults to `fetch`. */
  matrixFetch?: typeof fetch
  /** Test seam: the transport of the bridge `GET /status`; defaults to `fetch`. */
  whatsappFetch?: typeof fetch
  /** Test seam: the transport of the ntfy verification code; defaults to `fetch`. */
  ntfyFetch?: typeof fetch
}

/** The body of a `PATCH`: only a non-empty secret replaces the stored one. */
export function channelPatch(
  kind: string,
  input: UpdateChannelConfigurationRequest,
): {
  values: typeof notificationChannels.$inferInsert & { kind: string; name: string }
  set: Partial<typeof notificationChannels.$inferInsert>
} {
  const values: typeof notificationChannels.$inferInsert & { kind: string; name: string } = {
    kind,
    name: kind,
    updatedAt: new Date(),
  }
  const set: Partial<typeof notificationChannels.$inferInsert> = { updatedAt: values.updatedAt }

  if (input.enabled !== undefined) {
    values.enabled = input.enabled
    set.enabled = input.enabled
  }

  if (input.label !== undefined) {
    values.label = input.label
    set.label = input.label
  }

  if (input.config !== undefined) {
    values.config = input.config
    set.config = input.config
  }

  if (input.secret !== undefined && input.secret !== '') {
    values.secret = input.secret
    set.secret = input.secret
  }

  return { values, set }
}

/** Upserts the row of a kind keyed by `kind`; an empty secret stays untouched. */
export async function saveChannelConfiguration(
  database: Db,
  kind: string,
  input: UpdateChannelConfigurationRequest,
): Promise<void> {
  const { values, set } = channelPatch(kind, input)

  await database
    .insert(notificationChannels)
    .values(values)
    .onConflictDoUpdate({ target: notificationChannels.kind, set })
}

/** The machine-readable code of an adapter failure — never its message or secret. */
function failureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code

    if (typeof code === 'string' && code !== '') {
      return code
    }
  }

  return 'send_failed'
}

/**
 * Builds the test message and hands it to the adapter of the kind. A missing
 * adapter and a failing adapter are both a `delivered: false` with a code.
 * `testTopic` is an optional target override (for example an ntfy test topic)
 * that is handed to the adapter through the send options. `locale` is the
 * language of the sender (`PLAN.md` §3.1): the title and the body of the test
 * message reach the inbox of the user, so they come from `notification.test_*`
 * in `server.{de,en}.json` and not from a literal.
 */
/**
 * The recipient of a delivery in the log of the administration (§11.8,
 * ADR-0046): the address of a user is masked — the log of the mailbox never
 * carries a contact value in full (§11.13).
 */
const maskRecipient = (target: Record<string, unknown>): string => {
  const recipient = typeof target.recipientTarget === 'string' ? target.recipientTarget : ''

  if (recipient === '') {
    return '—'
  }

  const at = recipient.indexOf('@')

  if (at < 1) {
    return `${recipient.slice(0, 2)}…`
  }

  return `${recipient.slice(0, 1)}…${recipient.slice(at)}`
}

export async function sendTestMessage(
  channels: readonly NotificationChannel[],
  kind: string,
  testTopic?: string,
  locale?: string,
  testAddress?: string,
): Promise<{ delivered: boolean; code?: string }> {
  const channel = channels.find((candidate) => candidate.name === kind)

  if (channel === undefined) {
    return { delivered: false, code: 'channel_not_configured' }
  }

  const lng = locale === 'en' ? 'en' : 'de'

  try {
    await channel.send(
      { title: t(lng, 'notification.test_title'), body: t(lng, 'notification.test_body') },
      testTopic || testAddress === undefined
        ? testTopic === undefined
          ? undefined
          : { topic: testTopic }
        : { recipientTarget: testAddress },
    )

    return { delivered: true }
  } catch (error) {
    return { delivered: false, code: failureCode(error) }
  }
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

/**
 * A number of the query of the inbox (WP-M14-120c): a value that is missing or
 * that is not a number falls back to the default, a value below the minimum
 * rises to it and a value above the maximum falls to it.
 */
function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

async function channelAfterWrite(
  database: Db,
  env: Env,
  kind: string,
): Promise<ChannelConfiguration | undefined> {
  const configurations = await readChannelConfiguration(database, env)

  return configurations.find((configuration) => configuration.kind === kind)
}

/**
 * The guard of the session-only routes of §11.11: a session is enough, no
 * permission key — the code is bound to the user of that session.
 */
const requireSession: preHandlerHookHandler = async (request, reply) => {
  if (request.user !== undefined) {
    return
  }

  await reply.code(401).send({ code: 'session_invalid', params: {} })
}

/**
 * The subscription of the user (WP-M14-13, deep link corrected by WP-M14-33):
 * the public address of the ntfy server with the topic of the user and the
 * `ntfy://<host>/<topic>` deep link of the app — the ntfy docs state that a
 * deep link only opens the app and subscribes when it carries the host
 * (`https://<host>/<topic>/subscribe` is not possible on Android), and an
 * `http://` server takes the documented `?secure=false` suffix. The topic is
 * the stored `external_id` of the ntfy account of the session user — a user
 * without an account is provisioned with a fresh random topic from
 * `storeAccount` (WP-M14-72b, ADR-0024 point 6: the server creates the topic,
 * the derived `stoerdesk-<userId>` name is no longer a valid subscription) —
 * and the answer is empty when the ntfy server is not configured (no row and
 * no usable environment fallback). No credential ever enters the link: ntfy
 * offers no URL-login scheme and ADR-0005 keeps every secret write-only.
 */
function ntfySubscriptionOf(
  configuredUrl: string,
  topic: string,
): {
  publicUrl: string
  topic: string
  subscriptionUrl: string
  deepLink: string
} {
  const base = configuredUrl.replace(/\/+$/, '')

  return {
    publicUrl: base,
    topic,
    subscriptionUrl: `${base}/${topic}`,
    deepLink: ntfyDeepLink(base, topic),
  }
}

/** The ntfy app deep link `ntfy://<host>/<topic>` — host = the base without scheme (WP-M14-33). */
function ntfyDeepLink(base: string, topic: string): string {
  const insecure = /^http:\/\//i.test(base)
  const host = base.replace(/^https?:\/\//i, '')

  return `ntfy://${host}/${topic}${insecure ? '?secure=false' : ''}`
}

/** Empty answer when the ntfy server is not configured (§11.1, WP-M14-13). */
const EMPTY_NTFY_SUBSCRIPTION = {
  publicUrl: '',
  topic: '',
  subscriptionUrl: '',
  deepLink: '',
}

/** A refused exchange (wrong, expired or unknown code, wrong user) answers 422. */
const LINKING_REFUSALS: readonly TelegramLinkingErrorCode[] = [
  'invalid_code',
  'code_expired',
  'wrong_user',
]

function telegramLinkingRefusal(error: unknown): boolean {
  return error instanceof TelegramLinkingError && LINKING_REFUSALS.includes(error.code)
}

/** A refused Matrix verification (refused pair); a transport failure stays a server error. */
const MATRIX_LINKING_REFUSALS: readonly MatrixLinkingErrorCode[] = [
  'invalid_homeserver',
  'homeserver_error',
  'invalid_answer',
  'account_mismatch',
]

function matrixLinkingRefusal(error: unknown): boolean {
  return error instanceof MatrixLinkingError && MATRIX_LINKING_REFUSALS.includes(error.code)
}

/** A refused WhatsApp Web chat (a chat the bridge does not know); the bearer never answers. */
const WHATSAPP_LINKING_REFUSALS: readonly WhatsAppLinkingErrorCode[] = ['unknown_chat']

function whatsappLinkingRefusal(error: unknown): boolean {
  return (
    error instanceof WhatsAppLinkingError &&
    (WHATSAPP_LINKING_REFUSALS as readonly string[]).includes(error.code)
  )
}

/** The public `config` jsonb of a channel row as a flat map of string values. */
function bridgeSettings(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  const settings: Record<string, string> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      settings[key] = entry
    }
  }

  return settings
}

/**
 * The bridge config of the WhatsApp Web channel: the row `whatsapp` of
 * `notification_channels` wins over the environment (§11.2, ADR-0020) — its
 * public `config.baseUrl` and its write-only `secret` fall back to the
 * `WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN` keys. The bearer stays inside
 * the config the caller hands to the bridge, it is never answered (§11.13).
 */
async function whatsappBridgeConfig(database: Db, env: Env): Promise<BridgeConfig> {
  const [row] = await database
    .select({
      config: notificationChannels.config,
      secret: notificationChannels.secret,
    })
    .from(notificationChannels)
    .where(eq(notificationChannels.kind, 'whatsapp'))
    .limit(1)

  const settings = row === undefined ? {} : bridgeSettings(row.config)
  const token = row === undefined || row.secret === '' ? env.WHATSAPP_BRIDGE_TOKEN : row.secret

  return {
    baseUrl: settings.baseUrl ?? env.WHATSAPP_BRIDGE_URL,
    token,
  }
}

export const notificationChannelRoutes = fp<NotificationChannelRoutesOptions>(
  async (
    app,
    { database, env, channels, telegramFetch, matrixFetch, whatsappFetch, ntfyFetch },
  ) => {
    const registry = channels ?? configuredChannels(env)

    app.get(
      '/api/v1/admin/channels',
      { preHandler: requirePermission(database, PERMISSIONS.notification.read) },
      async () =>
        channelConfigurationListResponseSchema.parse({
          channels: await readChannelConfiguration(database, env),
        }),
    )

    app.patch<{ Params: { kind: string } }>(
      '/api/v1/admin/channels/:kind',
      { preHandler: requirePermission(database, PERMISSIONS.notification.write) },
      async (request, reply) => {
        const kind = notificationChannelKindSchema.safeParse(request.params.kind)

        if (!kind.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['kind'] } })
        }

        const body = updateChannelConfigurationRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        await saveChannelConfiguration(database, kind.data, body.data)

        const channel = await channelAfterWrite(database, env, kind.data)

        if (channel === undefined) {
          return reply.code(500).send({ code: 'channel_not_configured', params: {} })
        }

        return channelConfigurationSchema.parse(channel)
      },
    )

    app.post<{ Params: { kind: string } }>(
      '/api/v1/admin/channels/:kind/test',
      { preHandler: requirePermission(database, PERMISSIONS.notification.write) },
      async (request, reply) => {
        const kind = notificationChannelKindSchema.safeParse(request.params.kind)

        if (!kind.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['kind'] } })
        }

        const body = channelTestRequestSchema.safeParse(request.body ?? {})

        if (!body.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        // The test must send with the saved configuration, not with the
        // environment: the admin clicks it right after saving the row. The
        // access token of the ntfy server travels the same way — the write-only
        // `secret` of the row wins over `NTFY_TOKEN` and only ever enters the
        // `Authorization` header (ADR-0022, WP-M14-51).
        const effective =
          channels === undefined && kind.data === 'ntfy'
            ? await effectiveNtfyConfig(database, env, { requireVerified: false })
            : undefined
        const testRegistry =
          effective === undefined
            ? registry
            : configuredChannels({
                ...env,
                NTFY_URL: effective?.url ?? '',
                NTFY_TOPIC: effective?.topic ?? '',
                NTFY_TOKEN: effective?.token ?? env.NTFY_TOKEN,
              })

        // A test send that reaches no device is not a success: the web push
        // delivers to the browsers of the users, and without one single
        // subscription the click proves nothing about the channel — the answer
        // names that state instead of delivering an empty success
        // (WP-M15-10, §11.15).
        if (kind.data === 'webpush') {
          const subscribers = await database
            .select({ id: pushSubscriptions.id })
            .from(pushSubscriptions)
            .limit(1)

          if (subscribers.length === 0) {
            return channelTestResponseSchema.parse({
              delivered: false,
              code: 'push_no_subscription',
            })
          }
        }

        const result = await sendTestMessage(
          testRegistry,
          kind.data,
          body.data.topic,
          request.user?.locale,
          body.data.address,
        )

        return channelTestResponseSchema.parse(result)
      },
    )

    app.post(
      '/api/v1/admin/channels/ntfy/verification',
      { preHandler: requirePermission(database, PERMISSIONS.notification.write) },
      async (request, reply) => {
        try {
          const result = await requestNtfyVerification(
            database,
            env,
            ntfyFetch === undefined
              ? { locale: request.user?.locale }
              : { fetchImpl: ntfyFetch, locale: request.user?.locale },
          )

          return channelVerificationResponseSchema.parse(result)
        } catch (error) {
          if (error instanceof ChannelVerificationError) {
            const status = error.code === 'verification_send_failed' ? 502 : 422

            return reply.code(status).send({
              code: error.code,
              params: error.causeCode === '' ? {} : { reason: error.causeCode },
            })
          }

          throw error
        }
      },
    )

    app.post(
      '/api/v1/admin/channels/ntfy/verification/confirm',
      { preHandler: requirePermission(database, PERMISSIONS.notification.write) },
      async (request, reply) => {
        const body = confirmChannelVerificationRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        try {
          await confirmNtfyVerification(database, env, body.data.code)

          return confirmChannelVerificationResponseSchema.parse({ verified: true })
        } catch (error) {
          if (error instanceof ChannelVerificationError) {
            return reply.code(422).send({ code: error.code, params: {} })
          }

          throw error
        }
      },
    )

    /**
     * `GET /api/v1/admin/notifications/compliance` (`specs/10-notifications.md`
     * §11.9, §11.11, WP-M24-15): the users of the instance with the state of
     * every channel, the required channels they do not have set up and the flag
     * of the rule. The answer never names the address of a user (§11.13).
     */
    app.get(
      '/api/v1/admin/notifications/compliance',
      { preHandler: requirePermission(database, PERMISSIONS.notification.read) },
      async () =>
        notificationComplianceListResponseSchema.parse({
          users: await readCompliance(database),
        }),
    )

    /**
     * `GET /api/v1/admin/notifications/attempts` (`specs/10-notifications.md`
     * §11.11, §11.16, ADR-0052): the **protocol** of the delivery — every
     * delivery attempt of the instance with its recipient, its event, its
     * channel, its state, the machine code of a failure and the number of the
     * attempts. The page of the delivery `/admin/delivery` reads it beside the
     * problems of the channels.
     *
     * The protocol names the users, so the right `notification.read_all`
     * guards it: without the right the route answers `403 forbidden`. The
     * filters of §11.16 — the recipient, the channel, the event, the state —
     * narrow the answer; an unknown value answers `400 invalid_request` with
     * the field path.
     */
    app.get(
      '/api/v1/admin/notifications/attempts',
      { preHandler: requirePermission(database, PERMISSIONS.notification.readAll) },
      async (request, reply) => {
        const query = request.query as Record<string, string | undefined>
        const limit = boundedNumber(query.limit, 50, 1, 200)
        const offset = boundedNumber(query.offset, 0, 0, 100_000)

        const parsed = notificationDeliveryAttemptFilterSchema.safeParse({
          ...(query.userId === undefined || query.userId === '' ? {} : { userId: query.userId }),
          ...(query.channel === undefined || query.channel === '' ? {} : { channel: query.channel }),
          ...(query.eventType === undefined || query.eventType === ''
            ? {}
            : { eventType: query.eventType }),
          ...(query.state === undefined || query.state === '' ? {} : { state: query.state }),
        })

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        return notificationDeliveryAttemptListResponseSchema.parse({
          attempts: await readDeliveries(database, {
            filter: parsed.data,
            limit,
            offset,
          }),
          recipients: await readDeliveryRecipients(database, parsed.data),
        })
      },
    )

    /**
     * `GET /api/v1/notifications/compliance` (`specs/10-notifications.md`
     * §11.9, §11.12, WP-M24-15): the compliance of the signed-in user — the
     * warning of the own page names the missing channels and links to the
     * setup (§11.12). The answer carries the rule of the administration
     * itself (§11.19, WP-M35-01): the required channels and the minimum
     * number of channels, so the overview of the own page can name what is
     * mandatory without a second request.
     */
    app.get(
      '/api/v1/notifications/compliance',
      { preHandler: requireSession },
      async (request) =>
        notificationUserComplianceSchema.parse(
          await readUserComplianceWithPolicy(database, request.user?.id ?? ''),
        ),
    )

    /**
     * `GET /api/v1/notifications/alarm` (`specs/10-notifications.md` §11.17,
     * ADR-0048): whether the installation alarms with a sound and how often the
     * sound comes again. Every signed-in user must know it — the band of the
     * alarm reads it — while the administration writes it behind
     * `settings.write` (WP-M25-05).
     */
    app.get(
      '/api/v1/notifications/alarm',
      { preHandler: requireSession },
      async () => alarmSettingsSchema.parse(await readAlarmSettings(database)),
    )

    /**
     * `GET /api/v1/notifications/mute` (`specs/10-notifications.md` §11.17,
     * ADR-0048): the end of the silence of the signed-in user. The silence
     * follows the user and not the device — the row lives on the server.
     */
    app.get(
      '/api/v1/notifications/mute',
      { preHandler: requireSession },
      async (request) =>
        notificationMuteSchema.parse({
          mutedUntil: await readMuteUntil(database, request.user?.id ?? ''),
        }),
    )

    /**
     * `POST /api/v1/notifications/mute` (`specs/10-notifications.md` §11.17,
     * ADR-0048): the user is silent for **one hour**. The silence silences the
     * sound only — the band and the bell keep shining.
     */
    app.post(
      '/api/v1/notifications/mute',
      { preHandler: requireSession },
      async (request) => {
        const mutedUntil = await muteForOneHour(database, request.user?.id ?? '')

        return notificationMuteSchema.parse({ mutedUntil })
      },
    )

    /**
     * `GET /api/v1/admin/notifications/deliveries` (`specs/10-notifications.md`
     * §11.8, ADR-0046, WP-M24-20): the log of the last deliveries of a channel —
     * the mailbox of the instance shows the time, the recipient and the result.
     * A mail address is masked: the log never carries a contact value in full
     * (§11.13).
     */
    app.get(
      '/api/v1/admin/notifications/deliveries',
      { preHandler: requirePermission(database, PERMISSIONS.notification.read) },
      async (request) => {
        const query = deliveryLogQuerySchema.safeParse(request.query ?? {})

        if (!query.success) {
          return notificationDeliveryListResponseSchema.parse({ deliveries: [] })
        }

        const rows = await database
          .select({
            id: outbox.id,
            channel: outbox.channel,
            eventType: outbox.eventType,
            state: outbox.state,
            target: outbox.target,
            updatedAt: outbox.updatedAt,
          })
          .from(outbox)
          .where(eq(outbox.channel, query.data.channel))
          .limit(query.data.limit)

        return notificationDeliveryListResponseSchema.parse({
          deliveries: rows.map((row) => ({
            id: row.id,
            channel: row.channel,
            eventType: row.eventType,
            state: row.state,
            recipient: maskRecipient(row.target as Record<string, unknown>),
            sentAt: row.updatedAt.toISOString(),
          })),
        })
      },
    )

    /**
     * `GET /api/v1/notifications/status` (`specs/10-notifications.md` §11.8, §11.11,
     * WP-M14-19): the pending rows, the failed rows, the time of the last success
     * and the time of the last failure per channel — the same numbers the
     * dashboard tile reads, over the same rows of the outbox
     * (`resolveChannelStatus` of WP-M9-05). A failing channel is a warning for the
     * administration, never an error of the API.
     */
    app.get(
      '/api/v1/notifications/status',
      { preHandler: requirePermission(database, PERMISSIONS.notification.read) },
      async () =>
        channelStatusListResponseSchema.parse({
          channels: (await resolveChannelStatus(database)) ?? [],
        }),
    )

    /**
     * `GET /api/v1/notifications/delivery` (`specs/10-notifications.md` §11.8,
     * §11.11, WP-M14-161a): the delivery problems and the lost messages — per
     * channel the failed deliveries, the failures nobody acknowledged and the
     * times of the last failure and the last success, plus the failed rows of
     * the outbox, the messages that never arrived. A failing channel is a
     * warning for the administration, never an error of the API.
     */
    app.get(
      '/api/v1/notifications/delivery',
      { preHandler: requirePermission(database, PERMISSIONS.notification.read) },
      async () => deliveryProblemsResponseSchema.parse(await readDeliveryProblems(database)),
    )

    /**
     * `POST /api/v1/notifications/delivery/acknowledge` (`specs/10-notifications.md`
     * §11.8, §11.11, WP-M14-161a): the quittature of the problems — the named
     * channels, or every open problem when the body names none. The time of
     * the quittature is the watermark of the channel: a failure after it
     * opens the problem again.
     */
    app.post(
      '/api/v1/notifications/delivery/acknowledge',
      { preHandler: requirePermission(database, PERMISSIONS.notification.write) },
      async (request, reply) => {
        const parsed = acknowledgeDeliveryRequestSchema.safeParse(request.body ?? {})

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const answer = await acknowledgeDeliveryProblems(
          database,
          parsed.data.channels,
          request.user?.id ?? '',
        )

        return acknowledgeDeliveryResponseSchema.parse({
          acknowledgedAt: answer.acknowledgedAt.toISOString(),
          channels: answer.channels,
        })
      },
    )

    app.post(
      '/api/v1/notifications/accounts/telegram/code',
      { preHandler: requireSession },
      async (request, reply) => {
        try {
          const code = await createTelegramCode(database, env, request.user?.id ?? '')

          return telegramLinkCodeResponseSchema.parse(code)
        } catch (error) {
          if (error instanceof TelegramLinkingError && error.code === 'not_configured') {
            return reply.code(503).send({ code: 'channel_not_configured', params: {} })
          }

          if (telegramLinkingRefusal(error)) {
            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['code'] } })
          }

          throw error
        }
      },
    )

    app.post(
      '/api/v1/notifications/accounts/telegram',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = redeemTelegramLinkCodeRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply.code(422).send({ code: 'invalid_request', params: { fields: ['code'] } })
        }

        try {
          const account = await redeemTelegramCode(
            database,
            env,
            request.user?.id ?? '',
            body.data.code,
            telegramFetch ?? fetch,
          )

          return notificationAccountSchema.parse(account)
        } catch (error) {
          if (telegramLinkingRefusal(error)) {
            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['code'] } })
          }

          throw error
        }
      },
    )

    app.post(
      '/api/v1/notifications/accounts/matrix',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = matrixLinkingRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        try {
          const account = await storeMatrixAccount(
            database,
            request.user?.id ?? '',
            body.data,
            matrixFetch ?? fetch,
          )

          return notificationAccountSchema.parse(account)
        } catch (error) {
          if (matrixLinkingRefusal(error)) {
            return reply
              .code(422)
              .send({ code: 'invalid_request', params: { fields: ['homeserver'] } })
          }

          throw error
        }
      },
    )

    const chatIdSchema = z.object({ chatId: z.string().trim().min(1).max(200) })

    app.get(
      '/api/v1/notifications/accounts/whatsapp/status',
      { preHandler: requireSession },
      async () =>
        readBridgeStatus(await whatsappBridgeConfig(database, env), whatsappFetch ?? fetch),
    )

    app.post(
      '/api/v1/notifications/accounts/whatsapp',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = chatIdSchema.safeParse(request.body)

        if (!body.success) {
          return reply.code(422).send({ code: 'invalid_request', params: { fields: ['chatId'] } })
        }

        try {
          const account = await storeWhatsAppAccount(
            database,
            request.user?.id ?? '',
            body.data.chatId,
            await whatsappBridgeConfig(database, env),
            whatsappFetch ?? fetch,
          )

          return notificationAccountSchema.parse(account)
        } catch (error) {
          if (whatsappLinkingRefusal(error)) {
            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['chatId'] } })
          }

          throw error
        }
      },
    )

    /**
     * `GET /api/v1/notifications/accounts/webpush` (WP-M14-124): the VAPID
     * public key of the instance and how many devices the signed-in user has
     * registered. The endpoint is part of the request body of `POST`/`DELETE`
     * only — never of this answer and never of a log line.
     */
    app.get(
      '/api/v1/notifications/accounts/webpush',
      { preHandler: requireSession },
      async (request) => {
        const userId = request.user?.id ?? ''
        const [publicKey, subscriptions] = await Promise.all([
          readWebPushPublicKey(database, env),
          countWebPushSubscriptions(database, userId),
        ])

        return webPushConfigResponseSchema.parse({
          publicKey,
          subscribed: subscriptions > 0,
          subscriptions,
        })
      },
    )

    /**
     * `POST /api/v1/notifications/accounts/webpush` (WP-M14-124): registers the
     * browser subscription of the signed-in user. The endpoint is the device
     * identity, so a repeat subscription replaces the old row instead of adding
     * a second copy for the same notification.
     */
    app.post(
      '/api/v1/notifications/accounts/webpush',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = webPushSubscriptionRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        await storeWebPushSubscription(database, request.user?.id ?? '', {
          endpoint: body.data.endpoint,
          p256dh: body.data.keys.p256dh,
          auth: body.data.keys.auth,
        })

        return webPushSubscriptionResponseSchema.parse({ subscribed: true })
      },
    )

    /**
     * `POST /api/v1/notifications/accounts/webpush/check` (WP-M14-144): answers
     * whether the server still holds the row of this device of this user. The
     * browser knows its own subscription, the server knows its rows — only both
     * together say whether a push can arrive. The endpoint travels in the body
     * and never in the answer.
     */
    app.post(
      '/api/v1/notifications/accounts/webpush/check',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = webPushSubscriptionCheckRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        const registered = await hasWebPushSubscription(
          database,
          request.user?.id ?? '',
          body.data.endpoint,
        )

        return webPushSubscriptionCheckResponseSchema.parse({ registered })
      },
    )

    /**
     * `DELETE /api/v1/notifications/accounts/webpush` (WP-M14-124): removes one
     * device of the signed-in user. The answer is idempotent `204` — the browser
     * has already dropped its local subscription when it calls this route.
     */
    app.delete(
      '/api/v1/notifications/accounts/webpush',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = webPushUnsubscribeRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        await deleteWebPushSubscription(
          database,
          request.user?.id ?? '',
          body.data.endpoint,
        )

        return reply.code(204).send()
      },
    )

    /**
     * `GET /api/v1/notifications/accounts` (`specs/10-notifications.md` §11.3,
     * §11.11, WP-M24-05): the own accounts of the user with the state of every
     * channel — `ready` when the user confirmed the address with a code,
     * `linked` while the address was never confirmed. The address itself never
     * leaves the instance, and a channel without an account is simply missing
     * from the answer — the page reads the missing ones from the list of the
     * kinds (§11.12).
     */
    app.get(
      '/api/v1/notifications/accounts',
      { preHandler: requireSession },
      async (request) =>
        notificationAccountListResponseSchema.parse({
          accounts: await listAccounts(database, request.user?.id ?? ''),
        }),
    )

    /**
     * `POST /api/v1/notifications/accounts/:channel/verification`
     * (`specs/10-notifications.md` §11.3a, §11.11, WP-M24-08): sends the
     * one-time code over the channel of the account of the user and answers the
     * deadline of the code. The code itself travels over the channel — the API
     * never answers it.
     *
     * The answer names the cause of a refused send (WP-M24-21): a channel that
     * is not configured answers `422 channel_not_configured`, a channel that
     * refused the code answers `502 send_failed` with the machine code of the
     * refusal in `params.reason` (`http_403`, `http_timeout`, …) — the same
     * shape as the verification of the administration. Before, every refusal
     * answered a flat `422 invalid_request`, so a code that never arrived was
     * indistinguishable from a wrong code.
     */
    app.post<{ Params: { channel: string } }>(
      '/api/v1/notifications/accounts/:channel/verification',
      { preHandler: requireSession },
      async (request, reply) => {
        const channel = notificationChannelKindSchema.safeParse(request.params.channel)

        if (!channel.success) {
          return reply
            .code(404)
            .send({ code: 'account_not_found', params: { fields: ['channel'] } })
        }

        try {
          const answer = await requestChannelConfirmation(
            database,
            env,
            request.user?.id ?? '',
            channel.data,
            request.user?.locale === 'de' || request.user?.locale === 'en'
              ? request.user.locale
              : undefined,
          )

          return notificationVerificationResponseSchema.parse(answer)
        } catch (error) {
          if (error instanceof ConfirmationError) {
            if (error.code === 'send_failed') {
              return reply.code(502).send({
                code: 'send_failed',
                params: error.causeCode === '' ? {} : { reason: error.causeCode },
              })
            }

            if (error.code === 'channel_not_configured') {
              return reply.code(422).send({ code: 'channel_not_configured', params: {} })
            }

            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['channel'] } })
          }

          throw error
        }
      },
    )

    /**
     * `POST /api/v1/notifications/accounts/:channel/verification/confirm`
     * (`specs/10-notifications.md` §11.3a, §11.11, WP-M24-08): the code the
     * user copied is checked; a correct code confirms the account, so the
     * channel counts as a channel of the user (§11.3a, ADR-0045).
     */
    app.post<{ Params: { channel: string } }>(
      '/api/v1/notifications/accounts/:channel/verification/confirm',
      { preHandler: requireSession },
      async (request, reply) => {
        const channel = notificationChannelKindSchema.safeParse(request.params.channel)

        if (!channel.success) {
          return reply
            .code(404)
            .send({ code: 'account_not_found', params: { fields: ['channel'] } })
        }

        const body = confirmNotificationVerificationRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply.code(422).send({ code: 'invalid_request', params: { fields: ['code'] } })
        }

        try {
          const answer = await confirmChannelConfirmation(
            database,
            request.user?.id ?? '',
            channel.data,
            body.data.code,
          )

          return { confirmedAt: answer.confirmedAt }
        } catch (error) {
          if (error instanceof ConfirmationError) {
            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['code'] } })
          }

          throw error
        }
      },
    )

    /**
     * `POST /api/v1/notifications/accounts/email` (`specs/10-notifications.md`
     * §11.3, §11.11, WP-M24-09, ADR-0046): the own mail address becomes the
     * account of the e-mail channel. The address is the target of the messages
     * of the user; the user proves it with the one-time code of §11.3a.
     */
    app.post(
      '/api/v1/notifications/accounts/email',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = emailAccountRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        const account = await storeAccount(database, request.user?.id ?? '', {
          channel: 'email',
          externalId: body.data.address,
          label: body.data.address,
        })

        return notificationAccountSchema.parse(account)
      },
    )

    app.delete<{ Params: { channel: string } }>(
      '/api/v1/notifications/accounts/:channel',
      { preHandler: requireSession },
      async (request, reply) => {
        const channel = notificationChannelKindSchema.safeParse(request.params.channel)

        if (!channel.success) {
          return reply
            .code(404)
            .send({ code: 'account_not_found', params: { fields: ['channel'] } })
        }

        const removed = await deleteAccount(database, request.user?.id ?? '', channel.data)

        if (!removed) {
          return reply
            .code(404)
            .send({ code: 'account_not_found', params: { fields: ['channel'] } })
        }

        return reply.code(204).send()
      },
    )

    app.get(
      '/api/v1/notifications/accounts/ntfy',
      { preHandler: requireSession },
      async (request) => {
        const userId = request.user?.id ?? ''
        const configurations = await readChannelConfiguration(database, env)
        const ntfy = configurations.find((configuration) => configuration.kind === 'ntfy')
        const configuredUrl = ntfy?.config.url ?? ''

        if (ntfy === undefined || !ntfy.enabled || configuredUrl === '') {
          return EMPTY_NTFY_SUBSCRIPTION
        }

        // The stored topic of the user (WP-M14-72b): the subscription QR shows
        // what `ntfyRecipients` publishes to. A user without an ntfy account is
        // provisioned with a fresh random topic through `storeAccount` (WP-M14-72,
        // which replaces an empty `externalId` with `newNtfyTopic()`) — visiting
        // the QR connects the user (ADR-0024 point 6). A repeat visit keeps the
        // stored topic and writes nothing.
        const [stored] = await database
          .select({ externalId: notificationAccounts.externalId })
          .from(notificationAccounts)
          .where(
            and(
              eq(notificationAccounts.userId, userId),
              eq(notificationAccounts.channel, 'ntfy'),
            ),
          )
          .limit(1)

        const topic =
          stored === undefined || stored.externalId === ''
            ? (
              await storeAccount(database, userId, { channel: 'ntfy', externalId: '', label: '' })
            ).externalId
            : stored.externalId

        return ntfySubscriptionOf(configuredUrl, topic)
      },
    )

    /**
     * `POST /api/v1/notifications/accounts/ntfy/test` (§11.11, §11.12, WP-M14-121):
     * the test of the **own** topic of the session user. The administration route
     * `POST /api/v1/admin/channels/ntfy/test` needs `notification.write`, so the
     * button on the settings page of a user without that permission answered `403`.
     * This route stays behind the session alone. The target is the stored topic of
     * the user — never a topic of the request body: a client-supplied target would
     * let anyone publish to the topic of another user. A user without an ntfy
     * account answers `delivered: false` with `account_not_linked` and sends
     * nothing; a failing adapter stays the regular answer `delivered: false` with
     * the machine code of the adapter (the ntfy access token of the row reaches the
     * send in the `Authorization` header only, ADR-0022, WP-M14-51).
     */
    app.post(
      '/api/v1/notifications/accounts/ntfy/test',
      { preHandler: requireSession },
      async (request) => {
        const userId = request.user?.id ?? ''
        const [stored] = await database
          .select({ externalId: notificationAccounts.externalId })
          .from(notificationAccounts)
          .where(
            and(
              eq(notificationAccounts.userId, userId),
              eq(notificationAccounts.channel, 'ntfy'),
            ),
          )
          .limit(1)

        const topic = stored === undefined || stored.externalId === '' ? '' : stored.externalId

        if (topic === '') {
          return channelTestResponseSchema.parse({
            delivered: false,
            code: 'account_not_linked',
          })
        }

        const effective =
          channels === undefined
            ? await effectiveNtfyConfig(database, env, { requireVerified: false })
            : undefined

        const testRegistry =
          effective === undefined
            ? registry
            : configuredChannels({
                ...env,
                NTFY_URL: effective?.url ?? '',
                NTFY_TOPIC: effective?.topic ?? '',
                NTFY_TOKEN: effective?.token ?? env.NTFY_TOKEN,
              })

        return channelTestResponseSchema.parse(
          await sendTestMessage(testRegistry, 'ntfy', topic, request.user?.locale),
        )
      },
    )

    /**
     * `GET /api/v1/notifications/items` (`specs/10-notifications.md` §11.18,
     * ADR-0052): the **tasks** of the session user — one row per user and
     * event, the newest first. The inbox of a user is personal: the answer
     * never names another user and never names a channel or a delivery state
     * (the protocol of the administration is §11.16).
     *
     * Paginated with `limit` (default 50, max 200) and `offset`. The filters
     * are the event type and the unread tasks; an unknown value of the filter
     * answers `400 invalid_request` with the field path.
     */
    app.get(
      '/api/v1/notifications/items',
      { preHandler: requireSession },
      async (request, reply) => {
        const userId = request.user?.id ?? ''
        const query = request.query as Record<string, string | undefined>
        const limit = boundedNumber(query.limit, 50, 1, 200)
        const offset = boundedNumber(query.offset, 0, 0, 100_000)

        const parsed = notificationItemFilterSchema.safeParse({
          ...(query.eventType === undefined || query.eventType === ''
            ? {}
            : { eventType: query.eventType }),
          ...(query.unread === undefined || query.unread === ''
            ? {}
            : { unread: query.unread === 'true' ? true : query.unread === 'false' ? false : query.unread }),
        })

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        return notificationItemListResponseSchema.parse({
          items: await readItems(database, {
            userId,
            ...(parsed.data.eventType === undefined ? {} : { eventType: parsed.data.eventType }),
            ...(parsed.data.unread === undefined ? {} : { unread: parsed.data.unread }),
            limit,
            offset,
          }),
        })
      },
    )

    /**
     * `GET /api/v1/notifications/items/unread-count` (`specs/10-notifications.md`
     * §11.18, ADR-0052): the number of the unhandled tasks of the session user
     * — the badge of the bell of the shell and the band of the alarm count the
     * tasks, not the delivery attempts (§11.17).
     */
    app.get(
      '/api/v1/notifications/items/unread-count',
      { preHandler: requireSession },
      async (request) => {
        const count = await countUnreadItems(database, request.user?.id ?? '')

        return notificationUnreadCountResponseSchema.parse({ count })
      },
    )

    /**
     * `PATCH /api/v1/notifications/items/:id/read` (`specs/10-notifications.md`
     * §11.18, ADR-0052): marks one of the own tasks as read. A task of another
     * user or an unknown id answers `404 message_not_found` — the receipt is
     * bound to the session.
     */
    app.patch<{ Params: { id: string } }>(
      '/api/v1/notifications/items/:id/read',
      { preHandler: requireSession },
      async (request, reply) => {
        const receipt = await markItemRead(database, request.params.id, request.user?.id ?? '')

        if (receipt === null) {
          return reply.code(404).send({ code: 'message_not_found', params: {} })
        }

        return notificationItemReadResponseSchema.parse(receipt)
      },
    )
  },
  { name: 'stoerdesk-notification-channels' },
)
