import { eq } from 'drizzle-orm'

import type { Env } from '../../config/env'
import { databaseConnectionUrl } from '../../config/env'
import { createDatabase } from '../../db/client'
import { notificationChannels, pushSubscriptions, users } from '../../db/schema'
import { readWebPushConfiguration } from '../config'

export interface NotificationMessage {
  title: string
  body: string
  /**
   * The kind of the message — `ticket`, `readiness` or `test` — it names
   * the template of the e-mail (§11.5a).
   */
  kind?: string
  /** The machine-readable values of the message (§11.5). */
  params?: Record<string, unknown>
  /**
   * The urgency of the message (WP-M23-09d): `high` asks the push service to
   * deliver the message at once. A message without the field is `normal`.
   */
  urgency?: 'normal' | 'high'
}

/**
 * The optional target of a send: `topic` overrides the target topic (the ntfy
 * test topic of WP-M14-13), `deepLink` is the link of this message — the deep
 * link into the ticket of §11.5 which the drain of
 * `apps/api/src/notifications/outbox.ts` hands over (WP-M14-68).
 *
 * `recipientTarget`, `recipientSecret` and `userId` carry the **target of the
 * user** (ADR-0045): the chat of the user, the room of the user, the address
 * of the user — and the write-only secret of his account (the Matrix token),
 * which the drain reads from the account at the moment of the send and never
 * writes into the row of the outbox (§11.13). Without them the send goes to
 * the target of the installation — the room of the configuration, the chat of
 * the configuration, the addresses of the instance.
 */
export type MessageOptions = {
  topic?: string
  deepLink?: string
  /** The address of the user at the channel — the chat, the room, the mail address. */
  recipientTarget?: string
  /** The write-only secret of the account of the user — the Matrix token. */
  recipientSecret?: string
  /** The id of the user — the web push sends only to his devices. */
  userId?: string
}

export interface NotificationChannel {
  readonly name: string
  send(message: NotificationMessage, options?: MessageOptions): Promise<void>
}

/**
 * The link of a message: the deep link the caller handed over (the ticket of
 * `apps/api/src/notifications/outbox.ts`), otherwise the PWA root — an empty
 * PWA url means no link and the adapters omit it (WP-M14-68, §11.5).
 */
const messageLink = (env: Env, options?: MessageOptions): string => options?.deepLink ?? env.PWA_URL

const signalChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendSignalNotification } = await import('./signal.js')

  const recipients = env.SIGNAL_RECIPIENTS.split(',')
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0)

  await sendSignalNotification(
    {
      url: env.SIGNAL_CLI_URL,
      source: env.SIGNAL_SOURCE_NUMBER,
      recipients,
    },
    message,
    messageLink(env, options),
  )
}

/**
 * The target of a Matrix message (ADR-0045): the room of the user, his
 * homeserver and his access token. The target of the user is stored as a JSON
 * object in the `target` of the account — `{"homeserver":…,"roomId":…}` — while
 * a plain room id is accepted as well and then uses the homeserver of the
 * configuration. Without a target of the user the message goes to the room of
 * the installation.
 */
const matrixTargetOf = (
  env: Env,
  options?: MessageOptions,
): { homeserver: string; roomId: string; accessToken: string } => {
  const installation = {
    homeserver: env.MATRIX_HOMESERVER,
    roomId: env.MATRIX_ROOM_ID,
    accessToken: env.MATRIX_ACCESS_TOKEN,
  }
  const raw = options?.recipientTarget ?? ''

  if (raw === '') {
    return installation
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { homeserver?: unknown; roomId?: unknown }

      return {
        homeserver:
          typeof parsed.homeserver === 'string' && parsed.homeserver !== ''
            ? parsed.homeserver
            : installation.homeserver,
        roomId: typeof parsed.roomId === 'string' && parsed.roomId !== '' ? parsed.roomId : '',
        accessToken: options?.recipientSecret ?? installation.accessToken,
      }
    } catch {
      return { ...installation, accessToken: options?.recipientSecret ?? installation.accessToken }
    }
  }

  return {
    ...installation,
    roomId: raw,
    accessToken: options?.recipientSecret ?? installation.accessToken,
  }
}

const matrixChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendMatrixNotification } = await import('./matrix.js')

  const target = matrixTargetOf(env, options)

  await sendMatrixNotification(
    {
      homeserver: target.homeserver,
      roomId: target.roomId,
      accessToken: target.accessToken,
    },
    message,
    messageLink(env, options),
  )
}

const ntfyChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendNtfyNotification } = await import('./ntfy.js')

  await sendNtfyNotification(
    {
      url: env.NTFY_URL,
      topic: env.NTFY_TOPIC,
      token: env.NTFY_TOKEN,
      userTopic: options?.topic,
    },
    message,
    messageLink(env, options),
  )
}

/**
 * The recipients of the broadcast of the e-mail (ADR-0046): the mail addresses
 * of the users of the instance — the office is the list. A personal message
 * goes to the address of the user alone; a row without a recipient reads the
 * addresses of the users over its own short-lived pool, the same shape the
 * web-push and the WhatsApp closures use.
 */
const instanceMailRecipients = async (env: Env): Promise<string[]> => {
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    const rows = await database
      .select({ email: users.email })
      .from(users)
      .where(eq(users.active, true))

    return rows.map((row) => row.email).filter((address) => address !== '')
  } finally {
    await client.end({ timeout: 5 })
  }
}

/**
 * The mailbox of the instance (ADR-0046): the row of the channel wins over the
 * environment as a whole — the SMTP connection, the sender with its display
 * name and the templates live in the row of `notification_channels`. The
 * templates of §11.5a render the body of the mail as HTML: the empty lines
 * become paragraphs, the values are escaped and the deep link becomes a link.
 */
const emailChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendEmailNotification } = await import('./email.js')
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    const [row] = await database
      .select({
        config: notificationChannels.config,
        secret: notificationChannels.secret,
      })
      .from(notificationChannels)
      .where(eq(notificationChannels.kind, 'email'))

    const settings = row === undefined ? {} : bridgeSettings(row.config)
    const password = row === undefined || row.secret === '' ? env.SMTP_PASSWORD : row.secret

    const to =
      options?.recipientTarget === undefined
        ? await instanceMailRecipients(env)
        : [options.recipientTarget]

    await sendEmailNotification(
      {
        to,
        host: settings.host ?? env.SMTP_HOST,
        port: Number(settings.port ?? env.SMTP_PORT),
        secure: (settings.secure ?? String(env.SMTP_SECURE)) === 'true',
        user: settings.user ?? env.SMTP_USER,
        password,
        from: settings.from ?? env.SMTP_FROM,
        displayName: settings.displayName ?? '',
        templates: {
          ticket: settings.templateTicket ?? '',
          readiness: settings.templateReadiness ?? '',
          test: settings.templateTest ?? '',
          registration: settings.templateRegistration ?? '',
          passwordReset: settings.templatePasswordReset ?? '',
          customerTicket: settings.templateCustomerTicket ?? '',
        },
      },
      message,
      messageLink(env, options),
    )
  } finally {
    await client.end({ timeout: 5 })
  }
}

const telegramChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendTelegramNotification } = await import('./telegram.js')

  await sendTelegramNotification(
    {
      token: env.TELEGRAM_BOT_TOKEN,
      chatId: options?.recipientTarget ?? env.TELEGRAM_CHAT_ID,
    },
    message,
    messageLink(env, options),
  )
}

/**
 * The recipients of the web-push channel are the `push_subscriptions` rows of
 * migration `0019` (WP-M7-04 — rows only, no route yet). `configuredChannels(env)`
 * carries the environment alone, so the closure opens its own short-lived pool for
 * that one read, the same shape the pg-boss jobs use (`jobs/bma-sync.ts`,
 * WP-M2-36): the drain never hands its pool to a channel.
 *
 * The send uses the **effective VAPID trio** (WP-M14-158): the row of the
 * administration wins over the environment as a whole, so the key the browser
 * subscribed with and the key the server signs with are never two different
 * keys. Before, the send read the environment alone while the browser
 * subscribed with the public key of the administration — the push service
 * answered `403` for every send and the delivery failed with `send_failed`.
 *
 * A device the push service rejects as dead (`404`/`410`) is removed from
 * `push_subscriptions` after a send that reached at least one live device
 * (§11.15, ADR-0028). A send where **every** device is dead keeps its rows:
 * the retry of the drain probes them again and the row ends `FAILED` with the code
 * `push_subscription_dead`, so the chain of §11.1 falls back to the next channel.
 */
const webPushChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendWebPushNotification } = await import('./web-push.js')
  const { pruneDeadWebPushSubscriptions } = await import('../web-push-subscriptions.js')
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    const configuration = await readWebPushConfiguration(database, env)

    const devices = await database
      .select({
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)

    // A personal delivery reaches only the devices of its user (ADR-0045); the
    // instance delivery reaches every device of the instance.
    const subscriptions =
      options?.userId === undefined
        ? devices
        : devices.filter((device) => device.userId === options.userId)

    const result = await sendWebPushNotification(
      {
        publicKey: configuration.publicKey,
        privateKey: configuration.privateKey,
        subject: configuration.subject,
      },
      message,
      messageLink(env, options),
      subscriptions,
    )

    await pruneDeadWebPushSubscriptions(database, result.deadEndpoints)
  } finally {
    await client.end({ timeout: 5 })
  }
}

/** The public `config` jsonb of a channel row as a flat map of string values. */
const bridgeSettings = (value: unknown): Record<string, string> => {
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
 * The WhatsApp Web channel speaks the bridge contract of ADR-0020 (§11.6) —
 * StörDesk ships no browser and keeps no WhatsApp session. The chain entry stays
 * environment-based: the channel only enters the chain when both
 * `WHATSAPP_BRIDGE_URL` and `WHATSAPP_BRIDGE_TOKEN` are set. The effective
 * values of the send prefer the row of `notification_channels` with that kind
 * over the environment (§11.2): the row's `config.baseUrl` and `config.chatId`
 * and its `secret` win when they are there, the environment keys are the
 * fallback — read over the same short-lived pool the webpush closure opens.
 * A chain whose presence itself comes from the database belongs to the
 * outbox work, not to this registry.
 */
const whatsappChannel = async (
  env: Env,
  message: NotificationMessage,
  options?: MessageOptions,
): Promise<void> => {
  const { sendWhatsAppNotification } = await import('./whatsapp.js')
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    const [row] = await database
      .select({
        config: notificationChannels.config,
        secret: notificationChannels.secret,
      })
      .from(notificationChannels)
      .where(eq(notificationChannels.kind, 'whatsapp'))

    const settings: Record<string, string> = row === undefined ? {} : bridgeSettings(row.config)
    const token = row === undefined || row.secret === '' ? env.WHATSAPP_BRIDGE_TOKEN : row.secret

    await sendWhatsAppNotification(
      {
        baseUrl: settings.baseUrl ?? env.WHATSAPP_BRIDGE_URL,
        chatId: options?.recipientTarget ?? settings.chatId ?? '',
        token,
      },
      message,
      messageLink(env, options),
    )
  } finally {
    await client.end({ timeout: 5 })
  }
}

/**
 * Notification channels that are configured in the environment.
 *
 * A channel is only used when all of its required variables are set; missing
 * configuration disables the channel instead of failing at startup.
 */
export function configuredChannels(env: Env): NotificationChannel[] {
  const channels: NotificationChannel[] = []

  if (env.SIGNAL_CLI_URL !== '' && env.SIGNAL_SOURCE_NUMBER !== '') {
    channels.push({
      name: 'signal',
      send: (message, options) => signalChannel(env, message, options),
    })
  }

  if (env.MATRIX_HOMESERVER !== '' && env.MATRIX_ROOM_ID !== '' && env.MATRIX_ACCESS_TOKEN !== '') {
    channels.push({
      name: 'matrix',
      send: (message, options) => matrixChannel(env, message, options),
    })
  }

  if (env.NTFY_URL !== '' && env.NTFY_TOPIC !== '') {
    channels.push({
      name: 'ntfy',
      send: (message, options) => ntfyChannel(env, message, options),
    })
  }

  if (env.SMTP_HOST !== '' && env.SMTP_FROM !== '') {
    channels.push({
      name: 'email',
      send: (message, options) => emailChannel(env, message, options),
    })
  }

  if (env.TELEGRAM_BOT_TOKEN !== '' && env.TELEGRAM_CHAT_ID !== '') {
    channels.push({
      name: 'telegram',
      send: (message, options) => telegramChannel(env, message, options),
    })
  }

  if (env.VAPID_PUBLIC_KEY !== '' && env.VAPID_PRIVATE_KEY !== '' && env.VAPID_SUBJECT !== '') {
    channels.push({
      name: 'webpush',
      send: (message, options) => webPushChannel(env, message, options),
    })
  }

  if (env.WHATSAPP_BRIDGE_URL !== '' && env.WHATSAPP_BRIDGE_TOKEN !== '') {
    channels.push({
      name: 'whatsapp',
      send: (message, options) => whatsappChannel(env, message, options),
    })
  }

  return channels
}
