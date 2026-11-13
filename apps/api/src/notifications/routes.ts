import fp from 'fastify-plugin'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  channelConfigurationListResponseSchema,
  channelConfigurationSchema,
  channelTestRequestSchema,
  channelTestResponseSchema,
  matrixLinkingRequestSchema,
  notificationAccountSchema,
  notificationChannelKindSchema,
  notificationPreferencesListResponseSchema,
  PERMISSIONS,
  redeemTelegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
  type ChannelConfiguration,
  type UpdateChannelConfigurationRequest,
  updateChannelConfigurationRequestSchema,
  updateNotificationPreferencesRequestSchema,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { preHandlerHookHandler } from 'fastify'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationChannels } from '../db/schema'
import { configuredChannels, type NotificationChannel, type NotificationMessage } from './channels'
import { readChannelConfiguration } from './config'
import { deleteAccount } from './accounts'
import { readPreferences, writePreferences } from './preferences'
import { storeMatrixAccount, MatrixLinkingError, type MatrixLinkingErrorCode } from './matrix-linking'
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
}

const TEST_MESSAGE: NotificationMessage = {
  title: 'StörDesk test',
  body: 'This is a test notification.',
}

/** Builds a copy-pasteable curl command that reproduces the ntfy test request. */
function buildNtfyCurl(url: string, topic: string, pwaUrl: string): string {
  const base = url.replace(/\/$/, '')
  const fullUrl = `${base}/${topic}`
  const body = JSON.stringify({
    title: TEST_MESSAGE.title,
    message: TEST_MESSAGE.body,
    priority: 'default',
    actions: [{ action: 'view', label: 'Öffnen', uri: pwaUrl }],
  })
  return `curl -X POST "${fullUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "Priority: default" \\\n  -d '${body}'`
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
 * that is handed to the adapter through the send options.
 */
export async function sendTestMessage(
  channels: readonly NotificationChannel[],
  kind: string,
  testTopic?: string,
): Promise<{ delivered: boolean; code?: string }> {
  const channel = channels.find((candidate) => candidate.name === kind)

  if (channel === undefined) {
    return { delivered: false, code: 'channel_not_configured' }
  }

  try {
    await channel.send(TEST_MESSAGE, testTopic ? { topic: testTopic } : undefined)

    return { delivered: true }
  } catch (error) {
    return { delivered: false, code: failureCode(error) }
  }
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
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
 * derived from the user id — `stoerdesk-<userId>` (§11.3) — and the answer is
 * empty when the ntfy server is not configured (no row and no usable
 * environment fallback). No credential ever enters the link: ntfy offers no
 * URL-login scheme and ADR-0005 keeps every secret write-only.
 */
function ntfySubscriptionOf(configuredUrl: string, topic: string): {
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
const LINKING_REFUSALS: readonly TelegramLinkingErrorCode[] = ['invalid_code', 'code_expired', 'wrong_user']

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
  return error instanceof WhatsAppLinkingError && (WHATSAPP_LINKING_REFUSALS as readonly string[]).includes(error.code)
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
  async (app, { database, env, channels, telegramFetch, matrixFetch, whatsappFetch }) => {
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
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: ['kind'] } })
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
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: ['kind'] } })
        }

        const body = channelTestRequestSchema.safeParse(request.body ?? {})

        if (!body.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        let curlCommand: string | undefined
        if (kind.data === 'ntfy') {
          const configurations = await readChannelConfiguration(database, env)
          const ntfyCfg = configurations.find((c) => c.kind === 'ntfy')
          const ntfyConfig = ntfyCfg?.config as Record<string, string> | undefined
          const ntfyUrl = ntfyConfig?.url ?? env.NTFY_URL
          const ntfyTopic = body.data.topic ?? ntfyConfig?.topic ?? env.NTFY_TOPIC
          curlCommand = buildNtfyCurl(ntfyUrl, ntfyTopic, env.PWA_URL)
        }

        const result = await sendTestMessage(registry, kind.data, body.data.topic)

        if (result.delivered) {
          request.log.info(
            {
              channel: kind.data,
              code: 'notification_test_sent',
              curl: curlCommand,
            },
            'notification test sent',
          )
        } else {
          request.log.warn(
            {
              channel: kind.data,
              code: result.code ?? 'send_failed',
              curl: curlCommand,
            },
            'notification test failed',
          )
        }

        return channelTestResponseSchema.parse({
          ...result,
          ...(curlCommand !== undefined ? { curl: curlCommand } : {}),
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
          return reply.code(422).send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
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
            return reply.code(422).send({ code: 'invalid_request', params: { fields: ['homeserver'] } })
          }

          throw error
        }
      },
    )

    const chatIdSchema = z.object({ chatId: z.string().trim().min(1).max(200) })

    app.get(
      '/api/v1/notifications/accounts/whatsapp/status',
      { preHandler: requireSession },
      async () => readBridgeStatus(await whatsappBridgeConfig(database, env), whatsappFetch ?? fetch),
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

    app.delete<{ Params: { channel: string } }>(
      '/api/v1/notifications/accounts/:channel',
      { preHandler: requireSession },
      async (request, reply) => {
        const channel = notificationChannelKindSchema.safeParse(request.params.channel)

        if (!channel.success) {
          return reply.code(404).send({ code: 'account_not_found', params: { fields: ['channel'] } })
        }

        const removed = await deleteAccount(database, request.user?.id ?? '', channel.data)

        if (!removed) {
          return reply.code(404).send({ code: 'account_not_found', params: { fields: ['channel'] } })
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

        return ntfySubscriptionOf(configuredUrl, `stoerdesk-${userId}`)
      },
    )

    app.get(
      '/api/v1/notifications/preferences',
      { preHandler: requireSession },
      async (request) =>
        notificationPreferencesListResponseSchema.parse({
          preferences: await readPreferences(database, request.user?.id ?? ''),
        }),
    )

    app.put(
      '/api/v1/notifications/preferences',
      { preHandler: requireSession },
      async (request, reply) => {
        const body = updateNotificationPreferencesRequestSchema.safeParse(request.body)

        if (!body.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(body.error) } })
        }

        await writePreferences(database, request.user?.id ?? '', body.data.preferences)

        return notificationPreferencesListResponseSchema.parse({
          preferences: await readPreferences(database, request.user?.id ?? ''),
        })
      },
    )
  },
  { name: 'stoerdesk-notification-channels' },
)
