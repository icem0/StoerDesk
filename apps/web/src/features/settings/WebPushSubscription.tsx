import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

import type {
  WebPushConfigResponse,
  WebPushSubscriptionCheckResponse,
  WebPushSubscriptionResponse,
} from '@stoerdesk/shared'
import { HelpPopover } from '../../components/help-popover'
import { helpTriggerClass } from '../../components/help-trigger'
import { ApiError, apiFetch } from '../../lib/api'
import { keyToBase64Url, pushSupported, useBrowserPush } from '../../lib/web-push'

/**
 * The web-push card of the settings page (`specs/10-notifications.md` §11.1,
 * §11.3, WP-M14-126). The card reads the VAPID public key of the instance from
 * `GET /api/v1/notifications/accounts/webpush` (WP-M14-124), asks for the
 * notification permission on click and registers the browser subscription with
 * `POST`; removing the device calls `DELETE` with the own endpoint. A server
 * without keys hides the action and names the missing configuration, and a
 * browser without PushManager (or an iPhone outside the installed app) gets the
 * install hint instead of a button that cannot work.
 *
 * The state of the device comes from the probe of `apps/web/src/lib/web-push.ts`
 * (WP-M14-142): the browser itself says whether it holds a subscription, so the
 * card claims nothing that was not checked — and the inbox names the same
 * cause. The server says whether it knows the device (WP-M14-144): a device
 * the browser holds and the server does not know gets its own line and the
 * register action — no push message would ever arrive.
 */

const jsonHeaders = { 'content-type': 'application/json' }
const PAGE_PATH = '/settings/notifications'
const QR_SIZE_PX = 192
const QR_MARGIN_MODULES = 2

class WebPushActionError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'WebPushActionError'
    this.code = code
  }
}

/**
 * The VAPID public key as the byte sequence `pushManager.subscribe` expects:
 * URL-safe base64 without padding, padded back and mapped to standard base64.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/** The request body of `POST`: the capability endpoint and the two keys only. */
export function subscriptionBody(subscription: PushSubscription): {
  endpoint: string
  keys: { p256dh: string; auth: string }
} {
  const json = subscription.toJSON()

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  }
}

/**
 * Whether the subscription of the browser belongs to an **older** key pair: a
 * subscription of a key the server does not own is refused by the push service
 * for every send (`403`), and the browser keeps it — `subscribe()` returns the
 * subscription it holds. The card replaces such a device (WP-M14-172).
 *
 * A browser that does not name its key claims nothing: the device stays as it
 * is until the browser or the server knows better.
 */
export function subscriptionIsStale(subscriptionKey: string | null, serverKey: string): boolean {
  if (subscriptionKey === null || serverKey === '') {
    return false
  }

  return subscriptionKey.replace(/=+$/, '') !== serverKey.replace(/=+$/, '')
}

function errorCode(error: unknown): string {
  if (error instanceof WebPushActionError) {
    return error.code
  }

  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

export function WebPushSubscription() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const { push, refresh } = useBrowserPush()
  const state = push?.state ?? null
  const endpoint = push?.endpoint ?? null
  const supported = state !== null && state !== 'unsupported'

  const config = useQuery({
    queryKey: ['webpush-config'],
    queryFn: () => apiFetch<WebPushConfigResponse>('/v1/notifications/accounts/webpush'),
    retry: false,
  })

  // The browser knows its own subscription, the server knows its rows — only
  // both together say whether a push can arrive (WP-M14-144). The endpoint
  // travels in the body of the request and never in the answer.
  const device = useQuery({
    queryKey: ['webpush-device', endpoint],
    queryFn: () =>
      apiFetch<WebPushSubscriptionCheckResponse>('/v1/notifications/accounts/webpush/check', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ endpoint }),
      }),
    enabled: endpoint !== null,
    retry: false,
  })

  // `null` while the server has not answered: the card claims nothing then.
  const deviceKnown =
    device.isSuccess && typeof device.data.registered === 'boolean' ? device.data.registered : null

  const subscribe = useMutation({
    mutationFn: async (): Promise<WebPushSubscriptionResponse> => {
      if (!pushSupported()) {
        throw new WebPushActionError('unsupported')
      }

      const publicKey = config.data?.publicKey ?? ''
      if (publicKey === '') {
        throw new WebPushActionError('not_configured')
      }

      if ((await Notification.requestPermission()) !== 'granted') {
        throw new WebPushActionError('denied')
      }

      const registration = await navigator.serviceWorker.ready
      const current = (await registration.pushManager.getSubscription()) ?? null
      const currentKey = keyToBase64Url(current?.options.applicationServerKey)

      // A subscription of an older key pair belongs to a key the server does
      // not own: the push service refuses every send for it. The browser keeps
      // it, so the card removes it — in the browser and on the server — before
      // it registers the device again with the key of the server (WP-M14-172).
      if (current !== null && subscriptionIsStale(currentKey, publicKey)) {
        await current.unsubscribe()

        await apiFetch<void>('/v1/notifications/accounts/webpush', {
          method: 'DELETE',
          headers: jsonHeaders,
          body: JSON.stringify({ endpoint: current.endpoint }),
        })
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const stored = await apiFetch<WebPushSubscriptionResponse>(
        '/v1/notifications/accounts/webpush',
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify(subscriptionBody(subscription)),
        },
      )

      refresh()
      return stored
    },
    onSuccess: () => {
      void config.refetch()
      void queryClient.invalidateQueries({ queryKey: ['webpush-device'] })
    },
  })

  const unsubscribe = useMutation({
    mutationFn: async (): Promise<void> => {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = (await registration?.pushManager.getSubscription()) ?? null
      const target = subscription?.endpoint ?? endpoint

      await subscription?.unsubscribe()

      if (target !== null) {
        await apiFetch<void>('/v1/notifications/accounts/webpush', {
          method: 'DELETE',
          headers: jsonHeaders,
          body: JSON.stringify({ endpoint: target }),
        })
      }

      refresh()
    },
    onSuccess: () => {
      void config.refetch()
      void queryClient.invalidateQueries({ queryKey: ['webpush-device'] })
    },
  })

  const publicKey = config.data?.publicKey ?? ''
  const error = subscribe.error ?? unsubscribe.error
  /**
   * The browser holds a subscription of a key pair the server does not own:
   * the key of the server was renewed after the device registered. The push
   * service refuses every send for such a device, so the card names it and
   * registers it again (WP-M14-172).
   */
  const stale =
    state === 'subscribed' &&
    publicKey !== '' &&
    subscriptionIsStale(push?.key ?? null, publicKey)
  const qrValue =
    typeof window === 'undefined' ? PAGE_PATH : `${window.location.origin}${PAGE_PATH}`

  return (
    <section
      className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
      aria-labelledby="webpush-heading"
    >
      <h2 id="webpush-heading" className="text-lg font-semibold">
        {t('notifications.kinds.webpush')}
      </h2>

      <p className="text-sm text-slate-300">{t('notifications.webpush.guidance')}</p>

      {config.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {t('notifications.webpush.errors.unknown')}
        </p>
      ) : null}

      {config.isSuccess && publicKey === '' ? (
        <p className="text-sm text-amber-400">{t('notifications.webpush.notConfigured')}</p>
      ) : null}

      {config.isSuccess && publicKey !== '' ? (
        <>
          {!supported && state !== null ? (
            <p className="text-sm text-amber-400">{t('notifications.webpush.unsupported')}</p>
          ) : null}

          {state === 'denied' ? (
            <p className="text-sm text-amber-400">{t('notifications.webpush.errors.denied')}</p>
          ) : null}

          {supported && endpoint === null ? (
            <button
              className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              disabled={subscribe.isPending}
              onClick={() => subscribe.mutate()}
              type="button"
            >
              {t('notifications.webpush.subscribe')}
            </button>
          ) : null}

          {supported && endpoint !== null ? (
            <>
              {stale ? (
                <>
                  <p className="text-sm text-amber-400">{t('notifications.webpush.keyChanged')}</p>
                  <button
                    className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    disabled={subscribe.isPending}
                    onClick={() => subscribe.mutate()}
                    type="button"
                  >
                    {t('notifications.webpush.subscribe')}
                  </button>
                </>
              ) : null}

              {deviceKnown === true && !stale ? (
                <p className="text-sm text-emerald-400">{t('notifications.webpush.linked')}</p>
              ) : null}

              {deviceKnown === false && !stale ? (
                <>
                  <p className="text-sm text-amber-400">{t('notifications.webpush.notRegistered')}</p>
                  <button
                    className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    disabled={subscribe.isPending}
                    onClick={() => subscribe.mutate()}
                    type="button"
                  >
                    {t('notifications.webpush.subscribe')}
                  </button>
                </>
              ) : null}

              <button
                className="self-start rounded bg-slate-700 px-4 py-2 font-medium text-slate-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                disabled={unsubscribe.isPending}
                onClick={() => unsubscribe.mutate()}
                type="button"
              >
                {t('notifications.webpush.remove')}
              </button>
            </>
          ) : null}

          <p className="text-xs text-slate-400">
            {t('notifications.webpush.deviceCount', {
              count: config.data?.subscriptions ?? 0,
            })}
          </p>
        </>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-sm text-red-400">
          {t(`notifications.webpush.errors.${errorCode(error)}`, {
            defaultValue: t('notifications.webpush.errors.unknown'),
          })}
        </p>
      ) : null}

      {config.isSuccess && publicKey !== '' ? (
        <details className="text-sm text-slate-400">
          <summary className="cursor-pointer text-sky-300">
            {t('notifications.webpush.qrHint')}
          </summary>
          <QRCodeSVG
            className="mt-2 block rounded bg-white p-2"
            level="M"
            marginSize={QR_MARGIN_MODULES}
            size={QR_SIZE_PX}
            title={t('notifications.webpush.qrLabel')}
            value={qrValue}
          />
        </details>
      ) : null}

      <div className="mt-4 flex flex-col gap-1 text-sm text-slate-300">
        <p className="flex items-center gap-1">
          {t('notifications.webpush.install.title')}
          <HelpPopover
            className={helpTriggerClass}
            label={t('help:triggerFor', { name: t('notifications.webpush.install.title') })}
            text={t('help:notifications.installMore')}
          />
        </p>
        <p className="flex items-center gap-1">
          {t('notifications.webpush.activate.title')}
          <HelpPopover
            className={helpTriggerClass}
            label={t('help:triggerFor', { name: t('notifications.webpush.activate.title') })}
            text={t('help:notifications.activateMore')}
          />
        </p>
      </div>
    </section>
  )
}
