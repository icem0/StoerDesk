import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

/**
 * ntfy subscription card (WP-M7-03, `PLAN.md` §11 QR rules and §12 ntfy channel).
 *
 * The QR carries the public subscription address `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}`
 * of `docs/DEPLOYMENT.md`: any browser opens the ntfy web reader at that address and
 * the ntfy app recognises the same address in a scanned QR. The `ntfy://` deep link is
 * the alternative payload for a phone that already runs the app, chosen by the caller.
 *
 * The topic is static environment configuration — there is no API route for it
 * (non-goal of WP-M7-03). A settings page passes the two values as props; when no
 * page passes them, the build-time `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC` pair is
 * used, so an image build that carries them shows the card without a round trip.
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

/** Payload of the QR: the web address or the `ntfy://` deep link of the app. */
export function subscriptionValue(publicUrl: string, topic: string, deepLink: boolean): string {
  return deepLink ? `ntfy://${topic}` : `${ntfyBaseUrl(publicUrl)}/${topic}`
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
