import { t, type ServerLocale } from '@stoerdesk/shared'

export interface WhatsAppConfig {
  /** Base URL of the external WhatsApp bridge the operator runs, e.g. https://bridge.example.org — ADR-0020 */
  baseUrl: string
  /** Chat of the configuration or of the WhatsApp account of a user, e.g. the id the bridge offers (§11.3) */
  chatId: string
  /** Bearer of the bridge; the channel is off while it is empty (§11.2, ADR-0005) */
  token: string
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

export class WhatsAppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WhatsAppError'
    this.code = code
  }
}

/**
 * The label of the deep link, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the same `notification.action_label` the ntfy action,
 * the e-mail body, the Telegram and the Matrix text carry (`PLAN.md` §3.1,
 * WP-M7-04b).
 */
const actionLabel = (config: WhatsAppConfig): string => t(config.locale ?? 'de', 'notification.action_label')

/**
 * Sends a notification over the bridge contract of ADR-0020 (`specs/10-notifications.md`
 * §11.6): `POST {baseUrl}/messages` with `{ chatId, text }` and the bearer of the
 * bridge — StörDesk ships no browser and keeps no WhatsApp session. The text is
 * `${message.title}\n${message.body}` plus a `\n\n<label>: <pwaUrl>` deep link while
 * a PWA url exists — never a photo, never contact data (`PLAN.md` §12 message
 * content). Only `200` and `202` mean accepted; every other answer is a
 * `WhatsAppError` of the code `http_error` carrying the status only — the bearer
 * never enters the message. `fetchImpl` is the injectable transport: a test hands
 * it a mock response, the product path hands it the environment's `fetch`.
 */
export async function sendWhatsAppNotification(
  config: WhatsAppConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (config.token === '') {
    throw new WhatsAppError('no_token', 'No bridge bearer configured')
  }

  const baseUrl = config.baseUrl.replace(/\/$/, '')
  const body = `${message.title}\n${message.body}`
  const text = pwaUrl === '' ? body : `${body}\n\n${actionLabel(config)}: ${pwaUrl}`

  const response = await fetchImpl(
    `${baseUrl}/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ chatId: config.chatId, text }),
    },
  )

  if (response.status !== 200 && response.status !== 202) {
    // Status only: the bearer never enters the error message.
    throw new WhatsAppError('http_error', `WhatsApp bridge responded with ${response.status}`)
  }
}
