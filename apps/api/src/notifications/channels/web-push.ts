import { t, type ServerLocale } from '@stoerdesk/shared'
import * as webPush from 'web-push'

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
        },
      )

      delivered += 1
    } catch (error) {
      const statusCode = statusCodeOf(error)

      if (statusCode === 404 || statusCode === 410) {
        deadEndpoints.push(subscription.endpoint)
        continue
      }

      throw new WebPushError(
        'send_failed',
        statusCode === undefined
          ? 'The push service send failed'
          : `The push service responded with ${statusCode}`,
      )
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
