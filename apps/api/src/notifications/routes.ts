import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  channelConfigurationListResponseSchema,
  channelConfigurationSchema,
  channelTestResponseSchema,
  notificationAccountSchema,
  notificationChannelKindSchema,
  PERMISSIONS,
  redeemTelegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
  type ChannelConfiguration,
  type UpdateChannelConfigurationRequest,
  updateChannelConfigurationRequestSchema,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { preHandlerHookHandler } from 'fastify'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationChannels } from '../db/schema'
import { configuredChannels, type NotificationChannel, type NotificationMessage } from './channels'
import { readChannelConfiguration } from './config'
import {
  createTelegramCode,
  redeemTelegramCode,
  TelegramLinkingError,
  type TelegramLinkingErrorCode,
} from './telegram-linking'

/**
 * Admin channel configuration routes and the Telegram account linking routes
 * (`specs/10-notifications.md` §11.2, §11.11, WP-M14-05, WP-M14-09). The list is
 * the effective configuration of `readChannelConfiguration` and never carries a
 * secret; the write reports `secretSet` only. A failing test send is a regular
 * answer with `delivered: false` and the adapter code, never an HTTP error of the
 * administration. The linking routes are session-only: the bot token never enters
 * an answer, a log or an error message.
 */

type Db = Database['database']

export type NotificationChannelRoutesOptions = {
  database: Db
  env: Env
  /** Test seam: the adapters of the registry; defaults to `configuredChannels(env)`. */
  channels?: readonly NotificationChannel[]
  /** Test seam: the transport of the Bot API `getUpdates`; defaults to `fetch`. */
  telegramFetch?: typeof fetch
}

const TEST_MESSAGE: NotificationMessage = {
  title: 'StörDesk test',
  body: 'This is a test notification.',
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
 */
export async function sendTestMessage(
  channels: readonly NotificationChannel[],
  kind: string,
): Promise<{ delivered: boolean; code?: string }> {
  const channel = channels.find((candidate) => candidate.name === kind)

  if (channel === undefined) {
    return { delivered: false, code: 'channel_not_configured' }
  }

  try {
    await channel.send(TEST_MESSAGE)

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

/** A refused exchange (wrong, expired or unknown code, wrong user) answers 422. */
const LINKING_REFUSALS: readonly TelegramLinkingErrorCode[] = ['invalid_code', 'code_expired', 'wrong_user']

function telegramLinkingRefusal(error: unknown): boolean {
  return error instanceof TelegramLinkingError && LINKING_REFUSALS.includes(error.code)
}

export const notificationChannelRoutes = fp<NotificationChannelRoutesOptions>(
  async (app, { database, env, channels, telegramFetch }) => {
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

        return channelTestResponseSchema.parse(
          await sendTestMessage(registry, kind.data),
        )
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
  },
  { name: 'stoerdesk-notification-channels' },
)
