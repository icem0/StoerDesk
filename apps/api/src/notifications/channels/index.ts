import type { Env } from '../../config/env'
import { databaseConnectionUrl } from '../../config/env'
import { createDatabase } from '../../db/client'
import { pushSubscriptions } from '../../db/schema'

export interface NotificationMessage {
  title: string
  body: string
}

export interface NotificationChannel {
  readonly name: string
  send(message: NotificationMessage): Promise<void>
}

const signalChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
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
  )
}

const matrixChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
  const { sendMatrixNotification } = await import('./matrix.js')

  await sendMatrixNotification(
    {
      homeserver: env.MATRIX_HOMESERVER,
      roomId: env.MATRIX_ROOM_ID,
      accessToken: env.MATRIX_ACCESS_TOKEN,
    },
    message,
  )
}

const ntfyChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
  const { sendNtfyNotification } = await import('./ntfy.js')

  await sendNtfyNotification(
    {
      url: env.NTFY_URL,
      topic: env.NTFY_TOPIC,
    },
    message,
    env.PWA_URL,
  )
}

const emailChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
  const { sendEmailNotification } = await import('./email.js')

  await sendEmailNotification(
    {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
    },
    message,
    env.PWA_URL,
  )
}

const telegramChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
  const { sendTelegramNotification } = await import('./telegram.js')

  await sendTelegramNotification(
    {
      token: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    },
    message,
    env.PWA_URL,
  )
}

/**
 * The recipients of the web-push channel are the `push_subscriptions` rows of
 * migration `0019` (WP-M7-04 — rows only, no route yet). `configuredChannels(env)`
 * carries the environment alone, so the closure opens its own short-lived pool for
 * that one read, the same shape the pg-boss jobs use (`jobs/bma-sync.ts`,
 * WP-M2-36): the drain never hands its pool to a channel.
 */
const webPushChannel = async (env: Env, message: NotificationMessage): Promise<void> => {
  const { sendWebPushNotification } = await import('./web-push.js')
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    const subscriptions = await database
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)

    await sendWebPushNotification(
      {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      },
      message,
      env.PWA_URL,
      subscriptions,
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
      send: (message) => signalChannel(env, message),
    })
  }

  if (env.MATRIX_HOMESERVER !== '' && env.MATRIX_ROOM_ID !== '' && env.MATRIX_ACCESS_TOKEN !== '') {
    channels.push({
      name: 'matrix',
      send: (message) => matrixChannel(env, message),
    })
  }

  if (env.NTFY_URL !== '' && env.NTFY_TOPIC !== '') {
    channels.push({
      name: 'ntfy',
      send: (message) => ntfyChannel(env, message),
    })
  }

  if (env.SMTP_HOST !== '' && env.SMTP_FROM !== '') {
    channels.push({
      name: 'email',
      send: (message) => emailChannel(env, message),
    })
  }

  if (env.TELEGRAM_BOT_TOKEN !== '' && env.TELEGRAM_CHAT_ID !== '') {
    channels.push({
      name: 'telegram',
      send: (message) => telegramChannel(env, message),
    })
  }

  if (
    env.VAPID_PUBLIC_KEY !== '' &&
    env.VAPID_PRIVATE_KEY !== '' &&
    env.VAPID_SUBJECT !== ''
  ) {
    channels.push({
      name: 'webpush',
      send: (message) => webPushChannel(env, message),
    })
  }

  return channels
}
