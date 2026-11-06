import { t, type ServerLocale } from '@stoerdesk/shared'

export interface TelegramConfig {
  /** Bot token of an existing Telegram bot, e.g. 123456:ABC-def — the channel is off while it is empty */
  token: string
  /** Chat or channel the bot posts to, e.g. @stoerdesk or -1234567890 */
  chatId: string
  /**
   * Locale of the deep-link label. `de` is the default and reference locale
   * (`PLAN.md` §3.1) and an unset locale resolves to it, so a caller that knows
   * no locale still gets a translated label (WP-M7-04b).
   */
  locale?: ServerLocale
}

export interface NotificationMessage {
  title: string
  body: string
}

export class TelegramError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TelegramError'
    this.code = code
  }
}

/**
 * The label of the deep link, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the same `notification.action_label` the ntfy action
 * carries (`PLAN.md` §3.1, WP-M7-04b).
 */
const actionLabel = (config: TelegramConfig): string => t(config.locale ?? 'de', 'notification.action_label')

/**
 * Sends a notification through the Telegram Bot API.
 *
 * The message is posted to `sendMessage` of an existing bot: the ticket number and
 * the message body as text plus a `\n\n<label>: <pwaUrl>` deep link to the PWA
 * while a PWA url exists — never a photo, never contact data (`PLAN.md` §12
 * message content). An empty token cannot reach the Bot API and is reported
 * instead. `fetchImpl` is the injectable transport: a test hands it a mock
 * response, the product path hands it the environment's `fetch`.
 */
export async function sendTelegramNotification(
  config: TelegramConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (config.token === '') {
    throw new TelegramError('no_token', 'No bot token configured')
  }

  const body = `${message.title}\n${message.body}`
  const text = pwaUrl === '' ? body : `${body}\n\n${actionLabel(config)}: ${pwaUrl}`

  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text }),
    },
  )

  if (!response.ok) {
    // Status only: the token never enters the error message.
    throw new TelegramError('http_error', `Telegram responded with ${response.status}`)
  }
}
