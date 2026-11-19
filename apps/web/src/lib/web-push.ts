import { useEffect, useState } from 'react'

/**
 * The state of the push delivery **in this browser** (the web push of
 * `specs/10-notifications.md` §11.3, §11.12): what the browser itself answers
 * about its own subscription — never what the account of the user registered on
 * the server. The card of the settings page and the inbox read this one probe,
 * so both name the same cause. A claim about the browser that was never
 * checked is a lie.
 */
export type BrowserPushState =
  /** The browser has no push at all — no `PushManager`, no service worker. */
  | 'unsupported'
  /** The user blocked the notifications of this site. */
  | 'denied'
  /** This browser holds a push subscription. */
  | 'subscribed'
  /** The browser could, but this browser is not registered. */
  | 'not_subscribed'
  /** The browser did not answer — the state stays unknown, nothing is claimed. */
  | 'unknown'

/** What this browser knows about its own push subscription. */
export interface BrowserPush {
  state: BrowserPushState
  /** The endpoint of the subscription of this browser; `null` while there is none. */
  endpoint: string | null
  /**
   * The VAPID key this browser subscribed with, URL-safe base64 without padding
   * (`null` while there is no subscription). The card compares it with the key
   * of the server: a subscription of an older key pair is refused by the push
   * service for every send (WP-M14-172).
   */
  key: string | null
}

/**
 * The bytes of the key of a subscription as URL-safe base64 without padding —
 * the same form the key of the server travels in.
 */
export function keyToBase64Url(buffer: ArrayBuffer | null | undefined): string | null {
  if (buffer === null || buffer === undefined) {
    return null
  }

  let binary = ''

  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Whether this browser can subscribe at all; iOS needs the installed app. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Asks this browser for its own push subscription. The service worker
 * registration is read with `getRegistration()` and not with `ready`: a browser
 * without a registration has no subscription, while `ready` would wait for a
 * registration that never comes.
 */
export async function readBrowserPush(): Promise<BrowserPush> {
  if (!pushSupported()) {
    return { state: 'unsupported', endpoint: null, key: null }
  }

  if (Notification.permission === 'denied') {
    return { state: 'denied', endpoint: null, key: null }
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = (await registration?.pushManager.getSubscription()) ?? null

    return {
      state: subscription === null ? 'not_subscribed' : 'subscribed',
      endpoint: subscription?.endpoint ?? null,
      key: keyToBase64Url(subscription?.options?.applicationServerKey),
    }
  } catch {
    return { state: 'unknown', endpoint: null, key: null }
  }
}

/**
 * The probe as a hook: `null` while the browser has not answered yet. The
 * `refresh` reads the state again — after a subscribe or an unsubscribe.
 */
export function useBrowserPush(): { push: BrowserPush | null; refresh: () => void } {
  const [push, setPush] = useState<BrowserPush | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true

    void readBrowserPush().then((answer) => {
      if (active) {
        setPush(answer)
      }
    })

    return () => {
      active = false
    }
  }, [nonce])

  return { push, refresh: () => setNonce((value) => value + 1) }
}
