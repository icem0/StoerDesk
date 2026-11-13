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
  /** Ticket priority; `critical` becomes ntfy's `urgent` (WP-M14-07). */
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
 * The ntfy priority of §11.5: `urgent` for a critical ticket, the normal
 * `default` otherwise. The same value travels as the `Priority` header and in
 * the JSON payload.
 */
const ntfyPriority = (message: NotificationMessage): string =>
  message.priority === 'critical' ? 'urgent' : 'default'

/**
 * Sends a notification to an ntfy topic via HTTP POST.
 *
 * The message is published as JSON with a single `view` action that links to
 * the PWA. `pwaUrl` may be empty — the notification still arrives, the action
 * is just not clickable. A critical ticket raises the ntfy priority to
 * `urgent` (WP-M14-07). The topic is the topic of the ntfy account of the
 * user when the caller set `userTopic`, otherwise the configured topic of the
 * instance (`specs/10-notifications.md` §11.3, WP-M14-13).
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
  const url = `${config.url.replace(/\/$/, '')}/${topic}`

  const requestBody = JSON.stringify({
    title: message.title,
    message: message.body,
    priority,
    actions: [{ action: 'view', label: actionLabel(config), uri: pwaUrl }],
  })

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
    headers: { 'content-type': 'application/json', Priority: priority },
    body: requestBody,
  })

  if (!response.ok) {
    log?.warn?.('ntfy: send failed', { url, topic, status: response.status })
    throw new NtfyError('http_error', `ntfy responded with ${response.status}`)
  }

  log?.info?.('ntfy: notification sent', { url, topic, priority, title: message.title })
}
