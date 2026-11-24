import { createECDH } from 'node:crypto'

import { t, type ServerLocale } from '@stoerdesk/shared'
import webPush from 'web-push'

/**
 * The socket timeout of one push request (10 s) — the ntfy channel uses the
 * same value (`NTFY_TIMEOUT_MS`). Without it a connection that is blackholed
 * instead of refused keeps the request — and with it the drain of the outbox —
 * waiting forever (WP-M14-176).
 */
const WEB_PUSH_TIMEOUT_MS = 10_000

export interface WebPushConfig {
  /**
   * The VAPID public key, URL-safe base64 — from `VAPID_PUBLIC_KEY`. The channel
   * is off while any of the three VAPID keys is empty.
   */
  publicKey: string
  /** The VAPID private key, URL-safe base64 — from `VAPID_PRIVATE_KEY` */
  privateKey: string
  /**
   * The contact address the push service may reach, e.g. `mailto:admin@example.org`
   * — from `VAPID_SUBJECT`; a `https:` url or a `mailto:` address (VAPID `sub`).
   */
  subject: string
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
  /**
   * The urgency of the message (WP-M23-09d): `high` asks the push service to
   * deliver the message at once. A message without the field is `normal`.
   */
  urgency?: 'normal' | 'high'
}

export interface WebPushSubscription {
  /** The push endpoint the browser subscribed to — a capability url, never logged */
  endpoint: string
  /** The `p256dh` public key of the subscription — never logged */
  p256dh: string
  /** The `auth` secret of the subscription — never logged */
  auth: string
}

export class WebPushError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WebPushError'
    this.code = code
  }
}

/**
 * Whether the public key belongs to the private key: the browser subscribes
 * with the public key, the server signs with the private key, and the push
 * service accepts a send only when both belong to the same pair (RFC 8292). A
 * pair that does not belong together fails at the push service with `403` for
 * every device — the operator sees the code `vapid_key_mismatch` instead of
 * the generic `send_failed` (WP-M14-171).
 */
export function isVapidPair(publicKey: string, privateKey: string): boolean {
  try {
    const privateBytes = Buffer.from(privateKey, 'base64url')

    if (privateBytes.length !== 32) {
      return false
    }

    const curve = createECDH('prime256v1')
    curve.setPrivateKey(privateBytes)

    return curve.getPublicKey().equals(Buffer.from(publicKey, 'base64url'))
  } catch {
    return false
  }
}

/**
 * The label of the deep link, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the same `notification.action_label` the ntfy action,
 * the e-mail body and the Telegram text carry (`PLAN.md` §3.1, WP-M7-04b).
 */
const actionLabel = (config: WebPushConfig): string =>
  t(config.locale ?? 'de', 'notification.action_label')

/**
 * The answer of a send: the endpoints the push service rejected as dead.
 * An endpoint is a capability url and never enters a log line
 * (`specs/10-notifications.md` §11.15).
 */
export interface WebPushSendResult {
  /**
   * The endpoints the push service answered with `404` or `410` — the browser
   * revoked the permission, the browser was reinstalled or the subscription
   * expired. The channel removes those rows of `push_subscriptions`.
   */
  deadEndpoints: string[]
}

/**
 * Sends a notification to every stored web-push subscription.
 *
 * The payload text is the content `outbox.ts` (WP-M7-04) carries — ticket number,
 * priority, object name — plus a `\n\n<label>: <pwaUrl>` deep link while a PWA url
 * exists; never a photo, never contact data (`PLAN.md` §12). `web-push` (ADR-0010)
 * builds the request itself: the payload is encrypted per subscription (RFC 8295)
 * and the VAPID JWT is signed with the private key, so the push service knows the
 * application behind the `VAPID_SUBJECT` address. `sendImpl` is the injectable
 * transport: a test hands it a mock sender, the product path hands it the library.
 * The request carries the socket timeout of `WEB_PUSH_TIMEOUT_MS`, so a push
 * service that accepts the connection but never answers cannot block the drain
 * of the outbox.
 *
 * An empty subscription list is a no-op — the channel is configured, but nobody
 * subscribed yet. A rejected send stops the loop: the outbox row stays `PENDING`
 * and the drain (WP-M7-04c) retries it, which can deliver twice to a
 * subscriber that was already notified.
 *
 * A **dead** subscription (§11.15, ADR-0028) is the exception: the push service
 * answers `404` or `410` for it. The send continues with the next device, the
 * dead endpoint is answered in `deadEndpoints` and the channel removes its row.
 * Only when **every** device of the send is dead the send fails with the code
 * `push_subscription_dead` — the row of the outbox carries that code as its
 * `lastError` and the chain of §11.1 falls back to the next channel.
 *
 * Every other failure names its cause (WP-M14-171): the keys that do not belong
 * together fail with `vapid_key_mismatch` before the request, a rejected
 * authorization with `push_unauthorized`, another answer of the push service
 * with `push_rejected` and a request without an answer with `push_dns_failed`,
 * `push_timeout` or `push_unreachable` (by the errno). A failure **before** the
 * request leaves the server — a broken subscription row, a transport that is
 * not available — carries `push_send_failed` and never blames the network
 * (WP-M14-176). The operator reads the cause in the log of the API and
 * on the page of the delivery problems.
 *
 * **The transport of the library.** `web-push` is a CommonJS package whose
 * `module.exports` carries `sendNotification` as a call expression
 * (`webPush.sendNotification.bind(webPush)`). Node's ESM loader exposes such a
 * property only through the **default** export — the named exports of a
 * CommonJS module are the ones its lexer can read statically. The built API
 * (`esbuild --format=esm`, Node ESM) therefore knows `sendNotification` only as
 * the default export: a namespace import left it `undefined` there, every send
 * died with a `TypeError` before the request, and the failure was reported as
 * the unreachable push service (WP-M14-176). The guard above turns such a
 * build into the named code `push_send_failed` instead of a silent misdiagnosis.
 */
export async function sendWebPushNotification(
  config: WebPushConfig,
  message: NotificationMessage,
  pwaUrl: string,
  subscriptions: WebPushSubscription[],
  sendImpl: typeof webPush.sendNotification = webPush.sendNotification,
): Promise<WebPushSendResult> {
  if (config.publicKey === '' || config.privateKey === '' || config.subject === '') {
    throw new WebPushError('no_keys', 'No VAPID keys configured')
  }

  if (subscriptions.length === 0) {
    return { deadEndpoints: [] }
  }

  if (!isVapidPair(config.publicKey, config.privateKey)) {
    throw new WebPushError(
      'vapid_key_mismatch',
      'The VAPID public key does not belong to the private key',
    )
  }

  if (typeof sendImpl !== 'function') {
    throw new WebPushError(
      'push_send_failed',
      'The web-push transport is not available in this build',
    )
  }

  const body = `${message.title}\n${message.body}`
  const payload = pwaUrl === '' ? body : `${body}\n\n${actionLabel(config)}: ${pwaUrl}`
  const deadEndpoints: string[] = []
  let delivered = 0

  for (const subscription of subscriptions) {
    try {
      await sendImpl(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          timeout: WEB_PUSH_TIMEOUT_MS,
          // The urgency of the message (WP-M23-09d): `high` asks the push
          // service to deliver the message at once.
          ...(message.urgency === 'high' ? { urgency: 'high' as const } : {}),
        },
      )

      delivered += 1
    } catch (error) {
      const statusCode = statusCodeOf(error)

      if (statusCode === 404 || statusCode === 410) {
        deadEndpoints.push(subscription.endpoint)
        continue
      }

      throw new WebPushError(codeOf(statusCode, error), messageOf(error, statusCode))
    }
  }

  if (delivered === 0 && deadEndpoints.length > 0) {
    throw new WebPushError(
      'push_subscription_dead',
      'Every web-push subscription of this send is dead',
    )
  }

  return { deadEndpoints }
}

/**
 * The status the push service answered with — the library error carries it, a
 * test double carries it as a plain property. Never the message of the error.
 */
function statusCodeOf(error: unknown): number | undefined {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode

  return typeof statusCode === 'number' ? statusCode : undefined
}

/**
 * The code of a failed send (WP-M14-171, WP-M14-176) — the machine-readable name the
 * delivery page and the log show:
 *
 * - `push_unauthorized`: the push service answered `401` or `403` — the key
 *   does not belong to the registered device,
 * - `push_rejected`: the push service answered with another error,
 * - `push_dns_failed`: the host of the push service does not resolve (`ENOTFOUND`,
 *   `EAI_AGAIN`) — DNS of the container,
 * - `push_timeout`: the push service did not answer in time (`ETIMEDOUT`,
 *   `ESOCKETTIMEDOUT`, the timeout of the library) — typically a firewall that
 *   drops the packets,
 * - `push_unreachable`: any other transport failure (refused, reset, TLS).
 * - `push_send_failed`: the send failed **before** the request left the server —
 *   a broken subscription row or a transport that is not available. Never the
 *   network: a failure without a status and without an errno never reached the
 *   push service (WP-M14-176).
 */
function codeOf(statusCode: number | undefined, error: unknown): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'push_unauthorized'
  }

  if (statusCode !== undefined) {
    return 'push_rejected'
  }

  if (isTimeoutOf(error)) {
    return 'push_timeout'
  }

  const errno = errnoOf(error)

  if (errno === 'ENOTFOUND' || errno === 'EAI_AGAIN') {
    return 'push_dns_failed'
  }

  if (errno === 'ETIMEDOUT' || errno === 'ESOCKETTIMEDOUT') {
    return 'push_timeout'
  }

  if (errno === '') {
    return 'push_send_failed'
  }

  return 'push_unreachable'
}

/**
 * The message of a failed send: the status the push service answered with or
 * the errno of a transport failure (`ENOTFOUND`, `ETIMEDOUT` …). Never the
 * endpoint of a device — the endpoint is a capability url — and never a key.
 */
function messageOf(error: unknown, statusCode: number | undefined): string {
  if (statusCode !== undefined) {
    return `The push service responded with ${statusCode}`
  }

  if (isTimeoutOf(error)) {
    return `The push service did not answer within ${WEB_PUSH_TIMEOUT_MS} ms`
  }

  const errno = errnoOf(error)

  if (errno !== '') {
    return `The push service did not answer: ${errno}`
  }

  return 'The send failed before the request left the server'
}

/**
 * Whether the library ended the request itself: after its socket timeout it
 * destroys the request and rejects with a plain `Error('Socket timeout')` — the
 * one failure of the transport without an errno (WP-M14-176).
 */
function isTimeoutOf(error: unknown): boolean {
  return error instanceof Error && error.message === 'Socket timeout'
}

/**
 * The errno of a transport failure (`ENOTFOUND`, `ECONNREFUSED`,
 * `ETIMEDOUT` …) and of a TLS failure (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
 * `SELF_SIGNED_CERT_IN_CHAIN` …) — a short machine name, never a text of the
 * error. The name of a TLS failure is longer than twenty characters, so the
 * limit of sixty-three keeps it (WP-M14-176): a dropped errno turned a TLS
 * failure into a failure without a cause.
 */
function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code

  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : ''
}
