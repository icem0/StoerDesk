import type { Env } from '../../config/env'

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

  return channels
}
