import { t, type ServerLocale } from '@stoerdesk/shared'

export interface NtfyConfig {
  /** Base URL of an existing ntfy server, e.g. https://ntfy.sh */
  url: string
  /** Topic notifications are published to, e.g. stoerdesk */
  topic: string
  /**
   * Optional Bearer token for ntfy servers that require authentication
   * (WP-M14-51). Sent as the `Authorization` header; public topics (e. g.
   * ntfy.sh) do not need it.
   */
  token?: string
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
  /**
   * Deadline of the publish request in milliseconds (WP-M14-53). Unset means
   * `NTFY_TIMEOUT_MS`; a server that answers later fails as `http_timeout` and
   * the outbox keeps its three attempts with backoff (§11.7).
   */
  timeoutMs?: number
}

export interface NotificationMessage {
  title: string
  body: string
  /** Ticket priority; `critical` becomes ntfy's max priority `5` (WP-M14-07). */
  priority?: string
  /** Explicit ntfy level of an escalation action (WP-M14-89), 1–5. */
  ntfyPriority?: number
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
 * An aborted publish request — the error of `AbortSignal.timeout` is a
 * `DOMException` named `AbortError`, which is not an `Error` instance in every
 * runtime, so the name is read structurally (WP-M14-53).
 */
function aborted(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  return 'name' in error && String((error as { name?: unknown }).name) === 'AbortError'
}

/**
 * The ntfy priority of §11.5 as the number the JSON API expects: `5` (`max`,
 * ntfy's `urgent` equivalent) for a critical ticket, `3` (`default`) otherwise
 * (https://docs.ntfy.sh/publish/#publish-as-json — the JSON field is an integer
 * 1–5, not the string name of the header form).
 */
const ntfyPriority = (message: NotificationMessage): number =>
  message.priority === 'critical' ? 5 : 3

/**
 * The deadline of the publish request (WP-M14-53, §11.7): `fetch` has no
 * default timeout, so an ntfy server that accepts the connection but never
 * answers would hold the drain worker and the admin test send open until the
 * process is stopped. An aborted request ends as `NtfyError('http_timeout')`,
 * which keeps the rules of §11.7: the outbox row retries three times with
 * backoff and falls back to the next channel.
 */
export const NTFY_TIMEOUT_MS = 10_000

/**
 * Sends a notification to an ntfy topic via HTTP POST.
 *
 * The message is published as JSON to the server root (`POST /`) with the topic
 * in the body — posting a JSON body to `/{topic}` would make ntfy treat the
 * whole body as the plain-text message (https://docs.ntfy.sh/publish/#publish-as-json).
 * The single `view` action uses the JSON field `url`, not `uri`, and is omitted
 * entirely when `pwaUrl` is empty, because a `view` action without a URL is
 * invalid. A critical ticket raises the numeric priority to `5` (WP-M14-07); a
 * notification of an escalation action carries its own level in
 * `ntfyPriority` and wins over the ticket default (WP-M14-89).
 * The topic is the topic of the ntfy account of the user when the caller set
 * `userTopic`, otherwise the configured topic of the instance
 * (`specs/10-notifications.md` §11.3, WP-M14-13). A missing or wrong key of an
 * access-controlled server answers `401`/`403` (ADR-0022, WP-M14-51), a server
 * that does not answer in time ends as `http_timeout` (WP-M14-53) — the token
 * itself never enters a message, a log or an error text.
 */
export async function sendNtfyNotification(
  config: NtfyConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
  log?: { debug?: (msg: string, obj?: Record<string, unknown>) => void; info?: (msg: string, obj?: Record<string, unknown>) => void; warn?: (msg: string, obj?: Record<string, unknown>) => void },
): Promise<void> {
  const priority = message.ntfyPriority ?? ntfyPriority(message)
  const topic = config.userTopic && config.userTopic !== '' ? config.userTopic : config.topic
  const url = `${config.url.replace(/\/+$/, '')}/`
  const timeoutMs = config.timeoutMs ?? NTFY_TIMEOUT_MS

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

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    Priority: String(priority),
  }

  if (config.token) {
    headers['authorization'] = `Bearer ${config.token}`
  }

  const signal = AbortSignal.timeout(timeoutMs)
  let response: Response

  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (aborted(error)) {
      log?.warn?.('ntfy: request timed out', { url, topic, timeoutMs })
      throw new NtfyError('http_timeout', `ntfy did not answer within ${timeoutMs} ms`)
    }

    throw error
  }

  if (signal.aborted) {
    log?.warn?.('ntfy: request timed out', { url, topic, timeoutMs })
    throw new NtfyError('http_timeout', `ntfy did not answer within ${timeoutMs} ms`)
  }

  if (!response.ok) {
    log?.warn?.('ntfy: send failed', { url, topic, status: response.status })
    // The status becomes part of the machine code (http_407 …) so the
    // administration can explain which ntfy problem happened (WP-M14-49).
    throw new NtfyError(`http_${response.status}`, `ntfy responded with ${response.status}`)
  }

  log?.info?.('ntfy: notification sent', { url, topic, priority, title: message.title })
}
