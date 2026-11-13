import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

/**
 * ntfy subscription card (WP-M7-03, extended by WP-M14-13).
 *
 * The QR carries the public subscription address `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}`
 * of `docs/DEPLOYMENT.md`: any browser opens the ntfy web reader at that address and
 * the ntfy app recognises the same address in a scanned QR. The `ntfy://<host>/<topic>`
 * deep link (host-carrying since WP-M14-33, the format the ntfy docs state for
 * opening and subscribing in the app) is the alternative payload for a phone that
 * already runs the app, chosen by the caller.
 *
 * The address arrives as props from the settings page of WP-M14-13 — `GET /api/v1/notifications/accounts/ntfy`
 * answers the subscription address of the signed-in user, whose topic is derived from
 * the user id (`stoerdesk-<userId>`, §11.3). When no page passes the values, the build-time
 * `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC` pair is used, so an image build that carries
 * them shows the card without a round trip (the fallback of WP-M7-03).
 *
 * The card renders nothing while the topic or the server address is empty: a
 * deployment without an ntfy channel never shows a QR that subscribes to nothing.
 */

const QR_SIZE_PX = 224
const QR_MARGIN_MODULES = 2

const buildPublicUrl = import.meta.env.VITE_NTFY_PUBLIC_URL ?? ''
const buildTopic = import.meta.env.VITE_NTFY_TOPIC ?? ''

/** Public address of the ntfy server — a bare host gets the `https://` scheme. */
function ntfyBaseUrl(publicUrl: string): string {
  const withScheme = publicUrl.includes('://') ? publicUrl : `https://${publicUrl}`

  return withScheme.replace(/\/+$/, '')
}

/** Payload of the QR: the web address or the `ntfy://<host>/<topic>` deep link of the app. */
export function subscriptionValue(publicUrl: string, topic: string, deepLink: boolean): string {
  return deepLink ? ntfyDeepLink(publicUrl, topic) : `${ntfyBaseUrl(publicUrl)}/${topic}`
}

/**
 * The ntfy app deep link (corrected by WP-M14-33): the ntfy docs open and
 * subscribe a topic only with the host-carrying form `ntfy://<host>/<topic>` —
 * host = `publicUrl` without its scheme — and an `http://` server takes the
 * documented `?secure=false` suffix. No credential ever enters the link.
 */
function ntfyDeepLink(publicUrl: string, topic: string): string {
  const insecure = /^http:\/\//i.test(publicUrl)
  const host = publicUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')

  return `ntfy://${host}/${topic}${insecure ? '?secure=false' : ''}`
}

export interface NtfySubscriptionOptions {
  /** Public ntfy server, e.g. `https://ntfy.sh`; falls back to `VITE_NTFY_PUBLIC_URL`. */
  publicUrl?: string
  /** Topic the notifications are published to; falls back to `VITE_NTFY_TOPIC`. */
  topic?: string
  /** Render the `ntfy://<topic>` deep link instead of the web address. */
  deepLink?: boolean
}

export function NtfySubscription(options: NtfySubscriptionOptions = {}) {
  const { t } = useTranslation('common')
  const publicUrl = options.publicUrl ?? buildPublicUrl
  const topic = options.topic ?? buildTopic
  const deepLink = options.deepLink ?? false

  if (topic === '' || publicUrl === '') {
    return <></>
  }

  return (
    <section className="inline-block flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-4">
      <h2 className="mt-2 text-lg font-semibold">{t('ntfy.subscribe')}</h2>
      <QRCodeSVG
        className="self-center block rounded bg-white p-2"
        level="M"
        marginSize={QR_MARGIN_MODULES}
        size={QR_SIZE_PX}
        title={t('ntfy.qrLabel')}
        value={subscriptionValue(publicUrl, topic, deepLink)}
      />
      <p className="text-sm text-slate-400">{t('ntfy.appHint')}</p>
    </section>
  )
}
