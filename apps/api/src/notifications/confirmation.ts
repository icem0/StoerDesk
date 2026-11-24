import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { t, type ServerLocale } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationAccounts, pushSubscriptions, settings } from '../db/schema'
import { readEffectiveChannel, readWebPushConfiguration, type EffectiveChannel } from './config'
import { effectiveNtfyConfig } from './verification'
import { sendNtfyNotification } from './channels/ntfy'
import { sendTelegramNotification } from './channels/telegram'
import { sendMatrixNotification } from './channels/matrix'
import { sendEmailNotification } from './channels/email'
import { sendWhatsAppNotification } from './channels/whatsapp'
import { sendWebPushNotification } from './channels/web-push'

/**
 * The confirmation of a channel of a user (`specs/10-notifications.md` §11.3a,
 * ADR-0045): the server sends a one-time code over the very channel of the
 * account and the user enters the code in his own page. Only then the account
 * is *set up* and counts as a channel of the user — and for the rule of the
 * administration (§11.9).
 *
 * The code is six characters, valid for ten minutes and used once. It travels
 * to the user over the channel, never over the API: the answer carries the
 * deadline only.
 */

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>

/** The code consists of six unambiguous upper-case characters. */
const CODE_LENGTH = 6
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 10 * 60 * 1000

/** The machine-readable code of a refused confirmation. */
export type ConfirmationErrorCode =
  | 'account_missing'
  | 'invalid_code'
  | 'code_expired'
  | 'channel_not_configured'
  | 'send_failed'

/**
 * A refused confirmation. The route maps every code to `422 invalid_request` —
 * except the codes that name a state of the installation: a channel that is
 * not configured and a send that failed keep their own code, and the cause of
 * the failed send (`http_403`, `http_timeout`, …) travels in `causeCode`
 * (WP-M24-21).
 */
export class ConfirmationError extends Error {
  readonly code: ConfirmationErrorCode
  /** The machine code of the adapter that refused the send (`http_401` …). */
  readonly causeCode: string

  constructor(code: ConfirmationErrorCode, message: string, causeCode = '') {
    super(message)
    this.name = 'ConfirmationError'
    this.code = code
    this.causeCode = causeCode
  }
}

/** The key of the settings row that holds the pending code of a user and a channel. */
function pendingKey(userId: string, channel: string): string {
  return `notifications.confirmation.${userId}.${channel}`
}

/** Generates six unambiguous characters. */
function generateCode(): string {
  let code = ''

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }

  return code
}

/** The stored account of a user for a channel with its secret. */
interface StoredAccount {
  channel: string
  externalId: string
  label: string
  secret: string
  target: string
}

/** Reads the stored account of a user for a channel, or `undefined`. */
async function readStoredAccount(
  database: DbSelect,
  userId: string,
  channel: string,
): Promise<StoredAccount | undefined> {
  const [row] = await database
    .select({
      channel: notificationAccounts.channel,
      externalId: notificationAccounts.externalId,
      label: notificationAccounts.label,
      secret: notificationAccounts.secret,
      target: notificationAccounts.target,
    })
    .from(notificationAccounts)
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        eq(notificationAccounts.channel, channel),
      ),
    )
    .limit(1)

  return row
}

/** The pending code of a user and a channel. */
interface PendingCode {
  code: string
  expiresAt: string
}

/** The text of the code: the server translation with the code of the user. */
function codeText(locale: ServerLocale | undefined, code: string): string {
  return t(locale ?? 'de', 'notification.verification_code', { code })
}

/**
 * The target of a Matrix account: the homeserver and the room of the user,
 * stored as a JSON object in the `target` of the account. A plain room id is
 * accepted as well and then uses the homeserver of the configuration — the
 * effective one, so a homeserver that the administration configured in the
 * administration wins over the environment (§11.2).
 */
function matrixTargetOf(
  effective: EffectiveChannel,
  raw: string,
): { homeserver: string; roomId: string } {
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { homeserver?: unknown; roomId?: unknown }

      return {
        homeserver: typeof parsed.homeserver === 'string' ? parsed.homeserver : '',
        roomId: typeof parsed.roomId === 'string' ? parsed.roomId : '',
      }
    } catch {
      return { homeserver: '', roomId: '' }
    }
  }

  return { homeserver: effective.config.homeserver ?? '', roomId: raw }
}

/**
 * Sends the code over the channel of the account (`specs/10-notifications.md`
 * §11.3a): the channel of the user receives the code over its own transport —
 * the topic, the chat, the room, the mail address, the bridge, the push. The
 * code never enters a log or an answer.
 *
 * The transport is the **effective configuration of the installation** — the
 * row of `notification_channels` wins over the environment (§11.2, ADR-0022).
 * Before, the code of the user went to the environment alone: a ntfy server
 * that the administration configured in the administration (a self-hosted
 * server with access control, ADR-0024) published the code to the server of
 * the environment instead, without its access token — the code never arrived
 * and the page said nothing about the cause (WP-M24-21).
 *
 * The target is the target of the **user**: the topic of his ntfy account, the
 * chat of his account, the room of his account, his mail address, the chat of
 * his bridge account and — for the web push — only the devices of his own
 * account (ADR-0045, §11.13). A code of one user never reaches the device of
 * another one.
 */
async function sendCodeOverChannel(
  database: Db,
  env: Env,
  account: StoredAccount,
  code: string,
  locale: ServerLocale | undefined,
  userId: string,
): Promise<void> {
  const text = codeText(locale, code)
  const message = { title: text, body: text }

  switch (account.channel) {
    case 'ntfy': {
      // The target of the installation: the row wins over the environment, the
      // access token of the row travels in the `Authorization` header. The code
      // goes to the topic of the user, not to the topic of the instance.
      const target = await effectiveNtfyConfig(database, env, { requireVerified: false })

      if (target === null) {
        throw new ConfirmationError(
          'channel_not_configured',
          'ntfy has no usable configuration',
        )
      }

      await sendNtfyNotification({ ...target, userTopic: account.externalId }, message, '')

      return
    }

    case 'telegram': {
      const effective = await readEffectiveChannel(database, env, 'telegram')

      if (effective.secret === '') {
        throw new ConfirmationError(
          'channel_not_configured',
          'telegram has no bot token',
        )
      }

      await sendTelegramNotification(
        { token: effective.secret, chatId: account.externalId },
        message,
        '',
      )

      return
    }

    case 'matrix': {
      const effective = await readEffectiveChannel(database, env, 'matrix')
      const target = matrixTargetOf(effective, account.target)

      await sendMatrixNotification(
        {
          homeserver: target.homeserver,
          roomId: target.roomId,
          accessToken: account.secret === '' ? effective.secret : account.secret,
        },
        message,
        '',
      )

      return
    }

    case 'email': {
      const effective = await readEffectiveChannel(database, env, 'email')
      const from = effective.config.from ?? ''
      const port = Number(effective.config.port ?? '')

      if (from === '') {
        throw new ConfirmationError(
          'channel_not_configured',
          'email has no sender address',
        )
      }

      await sendEmailNotification(
        {
          to: [account.externalId],
          host: effective.config.host ?? '',
          port: Number.isFinite(port) ? port : 587,
          secure: (effective.config.secure ?? 'false') === 'true',
          user: effective.config.user ?? '',
          password: effective.secret,
          from,
        },
        message,
        '',
      )

      return
    }

    case 'whatsapp': {
      // WhatsApp Web exists only through its row (ADR-0020).
      const effective = await readEffectiveChannel(database, env, 'whatsapp')
      const baseUrl = effective.config.baseUrl ?? ''

      if (baseUrl === '' || effective.secret === '') {
        throw new ConfirmationError(
          'channel_not_configured',
          'whatsapp has no bridge',
        )
      }

      await sendWhatsAppNotification(
        {
          baseUrl,
          chatId: account.externalId,
          token: effective.secret,
        },
        message,
        '',
      )

      return
    }

    case 'webpush': {
      const configuration = await readWebPushConfiguration(database, env)

      // Only the devices of the user: a code of one user never reaches the
      // device of another one (ADR-0045, §11.13).
      const subscriptions = await database
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))

      if (subscriptions.length === 0) {
        throw new ConfirmationError(
          'send_failed',
          'The user has no device',
          'push_no_subscription',
        )
      }

      await sendWebPushNotification(
        {
          publicKey: configuration.publicKey,
          privateKey: configuration.privateKey,
          subject: configuration.subject,
        },
        message,
        '',
        subscriptions,
      )

      return
    }

    default: {
      throw new ConfirmationError('account_missing', 'The channel has no address of the user')
    }
  }
}

/**
 * Sends the one-time code over the channel of the account of the user
 * (`specs/10-notifications.md` §11.3a, WP-M24-08) and answers the deadline of
 * the code — the code itself travels over the channel, never over the API.
 *
 * A channel that refuses the code keeps the machine code of the refusal
 * (`http_403`, `http_timeout`, `no_token`, …) as the cause of the failure, so
 * the page of the user can name the cause instead of a bare "invalid request"
 * (WP-M24-21).
 */
export async function requestChannelConfirmation(
  database: Db,
  env: Env,
  userId: string,
  channel: string,
  locale?: ServerLocale,
): Promise<{ expiresAt: string }> {
  const account = await readStoredAccount(database, userId, channel)

  if (account === undefined) {
    throw new ConfirmationError('account_missing', 'The channel has no account of the user')
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  try {
    await sendCodeOverChannel(database, env, account, code, locale, userId)
  } catch (error) {
    if (error instanceof ConfirmationError) {
      throw error
    }

    throw new ConfirmationError(
      'send_failed',
      'The channel did not take the code',
      failureCodeOf(error),
    )
  }

  await writePending(database, userId, channel, { code, expiresAt })

  return { expiresAt }
}

/**
 * The machine-readable code of a refused send — the code of the adapter
 * (`http_401`, `no_token`, `push_unauthorized`, …) and never its message: a
 * message of an adapter can carry an address or a path (§11.13).
 */
function failureCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code

    if (typeof code === 'string' && code !== '') {
      return code
    }
  }

  return ''
}

/** Writes the pending code of a user and a channel. */
async function writePending(
  database: Db,
  userId: string,
  channel: string,
  pending: PendingCode,
): Promise<void> {
  await database
    .insert(settings)
    .values({ key: pendingKey(userId, channel), value: pending })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: pending, updatedAt: new Date() },
    })
}

/**
 * Checks the code the user copied and confirms the account: the account is
 * *set up* from now on and counts as a channel of the user (§11.3a).
 */
export async function confirmChannelConfirmation(
  database: Db,
  userId: string,
  channel: string,
  code: string,
): Promise<{ confirmedAt: string }> {
  const account = await readStoredAccount(database, userId, channel)

  if (account === undefined) {
    throw new ConfirmationError('account_missing', 'The channel has no account of the user')
  }

  const pending = await readPendingCode(database, userId, channel)

  if (pending === undefined || pending.code === '') {
    throw new ConfirmationError('invalid_code', 'There is no pending code for this channel')
  }

  const deadline = Date.parse(pending.expiresAt)

  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    throw new ConfirmationError('code_expired', 'The code has expired')
  }

  if (code.trim().toUpperCase() !== pending.code) {
    throw new ConfirmationError('invalid_code', 'The code does not match')
  }

  const confirmedAt = new Date()

  await database
    .update(notificationAccounts)
    .set({ verifiedAt: confirmedAt, updatedAt: confirmedAt })
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        eq(notificationAccounts.channel, channel),
      ),
    )

  await clearPending(database, userId, channel)

  return { confirmedAt: confirmedAt.toISOString() }
}

/** Reads the pending code of a user and a channel. */
async function readPendingCode(
  database: DbSelect,
  userId: string,
  channel: string,
): Promise<PendingCode | undefined> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, pendingKey(userId, channel)))
    .limit(1)

  const value = row?.value

  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined
  }

  const { code, expiresAt } = value as Record<string, unknown>

  return {
    code: typeof code === 'string' ? code : '',
    expiresAt: typeof expiresAt === 'string' ? expiresAt : '',
  }
}

/** Removes the pending code of a user and a channel. */
async function clearPending(database: Db, userId: string, channel: string): Promise<void> {
  await database
    .update(settings)
    .set({ value: { code: '', expiresAt: '' }, updatedAt: new Date() })
    .where(eq(settings.key, pendingKey(userId, channel)))
}

