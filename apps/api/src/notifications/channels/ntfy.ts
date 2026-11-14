import { t, type ServerLocale } from '@stoerdesk/shared'

export interface NtfyConfig {
  /** Base URL of an existing ntfy server, e.g. https://ntfy.sh */
  url: string
  /** Topic notifications are published to, e.g. stoerdesk */
  topic: string
  /**
   * Topic of the ntfy account of the user this message targets
   * (`specs/10-notifications.md` §11.3). When it is set the adapter sends to it
   * instead of the configured topic; otherwise the configured topic of the
   * instance is used (WP-M14-13).
   */
  userTopic?: string
  /**
   * Locale of the `view` action label. `de` is the default and reference locale
   * (`PLAN.md` §3.1) and an unset locale resolves to it, so a caller that knows
   * no locale still gets a translated label (WP-M7-04b).
   */
  locale?: ServerLocale
}

export interface NotificationMessage {
  title: string
  body: string
  /** Ticket priority; `critical` becomes ntfy's max priority `5` (WP-M14-07). */
  priority?: string
}

export class NtfyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'NtfyError'
    this.code = code
  }
}

/**
 * The label of the `view` action, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the German literal of WP-M7-01 never reaches a payload
 * again (`PLAN.md` §3.1, WP-M7-04b).
 */
const actionLabel = (config: NtfyConfig): string =>
  t(config.locale ?? 'de', 'notification.action_label')

/**
 * The ntfy priority of §11.5 as the number the JSON API expects: `5` (`max`,
 * ntfy's `urgent` equivalent) for a critical ticket, `3` (`default`) otherwise
 * (https://docs.ntfy.sh/publish/#publish-as-json — the JSON field is an integer
 * 1–5, not the string name of the header form).
 */
const ntfyPriority = (message: NotificationMessage): number =>
  message.priority === 'critical' ? 5 : 3

/**
 * Sends a notification to an ntfy topic via HTTP POST.
 *
 * The message is published as JSON to the server root (`POST /`) with the topic
 * in the body — posting a JSON body to `/{topic}` would make ntfy treat the
 * whole body as the plain-text message (https://docs.ntfy.sh/publish/#publish-as-json).
 * The single `view` action uses the JSON field `url`, not `uri`, and is omitted
 * entirely when `pwaUrl` is empty, because a `view` action without a URL is
 * invalid. A critical ticket raises the numeric priority to `5` (WP-M14-07).
 * The topic is the topic of the ntfy account of the user when the caller set
 * `userTopic`, otherwise the configured topic of the instance
 * (`specs/10-notifications.md` §11.3, WP-M14-13).
 */
export async function sendNtfyNotification(
  config: NtfyConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
  log?: { debug?: (msg: string, obj?: Record<string, unknown>) => void; info?: (msg: string, obj?: Record<string, unknown>) => void; warn?: (msg: string, obj?: Record<string, unknown>) => void },
): Promise<void> {
  const priority = ntfyPriority(message)
  const topic = config.userTopic && config.userTopic !== '' ? config.userTopic : config.topic
  const url = `${config.url.replace(/\/+$/, '')}/`

  const payload: Record<string, unknown> = {
    topic,
    title: message.title,
    message: message.body,
    priority,
  }

  if (pwaUrl !== '') {
    payload.actions = [{ action: 'view', label: actionLabel(config), url: pwaUrl }]
  }

  log?.info?.('ntfy: POST request', {
    url,
    method: 'POST',
    topic,
    priority,
    title: message.title,
    body: message.body,
    pwaUrl,
  })

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Priority: String(priority) },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    log?.warn?.('ntfy: send failed', { url, topic, status: response.status })
    throw new NtfyError('http_error', `ntfy responded with ${response.status}`)
  }

  log?.info?.('ntfy: notification sent', { url, topic, priority, title: message.title })
}
