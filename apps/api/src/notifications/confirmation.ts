import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { t, type ServerLocale } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationAccounts, pushSubscriptions, settings } from '../db/schema'
import { readWebPushConfiguration } from './config'
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

/** A refused confirmation; the route maps every code to `422 invalid_request`. */
export class ConfirmationError extends Error {
  readonly code: ConfirmationErrorCode

  constructor(code: ConfirmationErrorCode, message: string) {
    super(message)
    this.name = 'ConfirmationError'
    this.code = code
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
 * accepted as well and then uses the homeserver of the configuration.
 */
function matrixTargetOf(
  env: Env,
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

  return { homeserver: env.MATRIX_HOMESERVER, roomId: raw }
}

/**
 * Sends the code over the channel of the account (`specs/10-notifications.md`
 * §11.3a): the channel of the user receives the code over its own transport —
 * the topic, the chat, the room, the mail address, the bridge, the push. The
 * code never enters a log or an answer.
 */
async function sendCodeOverChannel(
  database: Db,
  env: Env,
  account: StoredAccount,
  code: string,
  locale: ServerLocale | undefined,
): Promise<void> {
  const text = codeText(locale, code)
  const message = { title: text, body: text }

  switch (account.channel) {
    case 'ntfy': {
      await sendNtfyNotification(
        {
          url: env.NTFY_URL,
          topic: env.NTFY_TOPIC,
          token: env.NTFY_TOKEN,
          userTopic: account.externalId,
        },
        message,
        '',
      )

      return
    }

    case 'telegram': {
      await sendTelegramNotification(
        { token: env.TELEGRAM_BOT_TOKEN, chatId: account.externalId },
        message,
        '',
      )

      return
    }

    case 'matrix': {
      const target = matrixTargetOf(env, account.target)

      await sendMatrixNotification(
        {
          homeserver: target.homeserver,
          roomId: target.roomId,
          accessToken: account.secret,
        },
        message,
        '',
      )

      return
    }

    case 'email': {
      await sendEmailNotification(
        {
          to: [account.externalId],
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM,
        },
        message,
        '',
      )

      return
    }

    case 'whatsapp': {
      await sendWhatsAppNotification(
        {
          baseUrl: env.WHATSAPP_BRIDGE_URL,
          chatId: account.externalId,
          token: env.WHATSAPP_BRIDGE_TOKEN,
        },
        message,
        '',
      )

      return
    }

    case 'webpush': {
      const configuration = await readWebPushConfiguration(database, env)

      const subscriptions = await database
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)

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
    await sendCodeOverChannel(database, env, account, code, locale)
  } catch (error) {
    if (error instanceof ConfirmationError) {
      throw error
    }

    throw new ConfirmationError('send_failed', 'The channel did not take the code')
  }

  await writePending(database, userId, channel, { code, expiresAt })

  return { expiresAt }
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

