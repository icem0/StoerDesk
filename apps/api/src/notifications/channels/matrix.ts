import { t, type ServerLocale } from '@stoerdesk/shared'

export interface MatrixConfig {
  /** Base URL of an existing Matrix homeserver, e.g. https://matrix.org */
  homeserver: string
  /** Room ID, e.g. !abcdef:example.org */
  roomId: string
  /** Access token of the sending user */
  accessToken: string
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

export class MatrixError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'MatrixError'
    this.code = code
  }
}

/**
 * The label of the deep link, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the same `notification.action_label` the ntfy action,
 * the e-mail body and the Telegram text carry (`PLAN.md` §3.1, WP-M7-04b).
 */
const actionLabel = (config: MatrixConfig): string =>
  t(config.locale ?? 'de', 'notification.action_label')

/**
 * Sends notifications to a Matrix room via the client-server API.
 *
 * The transaction id has to be unique per message, otherwise the homeserver
 * rejects the request. The message body is `${title}\n${body}` plus a
 * `\n\n<label>: <pwaUrl>` deep link while a PWA url exists — never a photo,
 * never contact data (`PLAN.md` §12 message content).
 */
export async function sendMatrixNotification(
  config: MatrixConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const homeserver = config.homeserver.replace(/\/$/, '')
  const roomId = encodeURIComponent(config.roomId)
  const transactionId = `stoerdesk-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const body = `${message.title}\n${message.body}`
  const text = pwaUrl === '' ? body : `${body}\n\n${actionLabel(config)}: ${pwaUrl}`

  const response = await fetchImpl(
    `${homeserver}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${transactionId}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: text,
      }),
    },
  )

  if (!response.ok) {
    throw new MatrixError('http_error', `Matrix homeserver responded with ${response.status}`)
  }
}
