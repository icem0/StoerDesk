import { precacheAndRoute } from 'workbox-precaching'
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { registerRoute } from 'workbox-routing'

import { isInternalTicketRead, isInternalTicketWrite, isPublicReportPath } from './lib/sw-routes'

/**
 * The cache that holds the offline copies of assigned tickets (WP-M5-07).
 */
const CACHE_INTERNAL_TICKETS = 'internal-tickets'

declare global {
  interface Window {
    /** Injected by vite-plugin-pwa at build time (injectManifest strategy). */
    __WB_MANIFEST: Array<{ url: string; revision: string }>
  }
}

/** Precaches the app shell so the report form loads offline (WP-M2-09a). */
precacheAndRoute(self.__WB_MANIFEST)

/**
 * The part of the service-worker scope the takeover needs (WP-M22-01).
 */
export interface ServiceWorkerScope {
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
}

/**
 * The part of the event target the takeover registers its listeners on.
 */
export interface ServiceWorkerEvents {
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
  ): void
}

/**
 * A new version of the service worker takes over at once (WP-M22-01).
 *
 * The precache holds the shell of the app (`index.html`) beside the assets, so
 * a browser that keeps the **old** service worker also keeps the old shell: a
 * document without the `<link rel="manifest">` of the build, and the browser
 * offers no install of the app ("Page has no manifest `<link>` URL" in
 * Firefox). The web push of the browser rides on the same shell — the
 * subscription lives in the service worker of this scope.
 *
 * `skipWaiting()` on `install` lets the new worker replace the old one without
 * waiting for every tab of the old version to close, `clients.claim()` on
 * `activate` hands the open pages to the new worker right away.
 */
export function registerTakeover(
  scope: ServiceWorkerScope,
  events: ServiceWorkerEvents,
): void {
  events.addEventListener('install', (event) => {
    event.waitUntil(scope.skipWaiting())
  })

  events.addEventListener('activate', (event) => {
    event.waitUntil(scope.clients.claim())
  })
}

registerTakeover(self as unknown as ServiceWorkerScope, self as unknown as ServiceWorkerEvents)

/**
 * Reports that fail while the device is offline are kept in this queue and
 * retried by the browser when the connection returns. The `sync-report` tag is
 * the background-sync channel announced by WP-M2-09a; browsers without
 * background-sync support (iOS) are covered by the `online` listener in
 * `main.tsx` that calls `replayOutbox()`.
 */
const reportQueue = new BackgroundSyncPlugin('sync-report', {
  maxRetentionTime: 24 * 60,
})

registerRoute(
  ({ url }) => isPublicReportPath(url.pathname),
  new NetworkOnly({ plugins: [reportQueue] }),
  'POST',
)

/**
 * Assigned tickets stay readable offline: list and detail are served from the
 * `internal-tickets` cache while the network revalidates in the background
 * (WP-M5-07). Action paths (accept, claim, comments) stay network-only.
 */
registerRoute(
  ({ url }) => isInternalTicketRead(url.pathname),
  new StaleWhileRevalidate({
    cacheName: CACHE_INTERNAL_TICKETS,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 12 * 3600 })],
  }),
  'GET',
)

/**
 * The detail URL of a write URL: `<base>/v1/tickets/<ticketNo>/<action>` becomes
 * `<base>/v1/tickets/<ticketNo>`. Returns `null` for a URL that is not a write
 * to a ticket.
 */
export function ticketDetailUrl(writeUrl: string): string | null {
  let url: URL

  try {
    url = new URL(writeUrl)
  } catch {
    return null
  }

  if (!isInternalTicketWrite(url.pathname)) {
    return null
  }

  const segments = url.pathname.split('/')

  segments.pop()
  url.pathname = segments.join('/')
  url.search = ''
  return url.toString()
}

/**
 * Drops the cached copy of a ticket whose detail was just written. Without
 * this invalidation the next read of that ticket is answered from the cache
 * with the copy from before the write, so a new comment stays invisible until
 * the next reload (WP-M5-17).
 */
export async function invalidateCachedTicket(
  cacheStorage: CacheStorage,
  writeUrl: string,
): Promise<void> {
  const detailUrl = ticketDetailUrl(writeUrl)

  if (detailUrl === null) {
    return
  }

  const cache = await cacheStorage.open(CACHE_INTERNAL_TICKETS)
  const keys = await cache.keys()

  await Promise.all(
    keys
      .filter((request) => request.url === detailUrl)
      .map((request) => cache.delete(request)),
  )
}

/**
 * A write to a ticket (comment, acknowledge, decline, workflow action) goes to
 * the network and invalidates the cached copy of that ticket, so the next read
 * sees the new event (WP-M5-17).
 */
registerRoute(
  ({ url }) => isInternalTicketWrite(url.pathname),
  new NetworkOnly({
    plugins: [
      {
        fetchDidSucceed: async ({ request, response }) => {
          await invalidateCachedTicket(caches, request.url)
          return response
        },
      },
    ],
  }),
  'POST',
)

/**
 * Clears only the `internal-tickets` cache on sign-out, so the next online
 * read re-fetches from the server. The precache and every other cache stay
 * untouched. Answers `CLEAR_USER_CACHE_DONE` on `port`.
 */
export async function clearUserCache(
  cacheStorage: CacheStorage,
  port: MessagePort,
): Promise<void> {
  await cacheStorage.delete(CACHE_INTERNAL_TICKETS)
  void port.postMessage({ type: 'CLEAR_USER_CACHE_DONE' })
}

self.addEventListener('message', (event: MessageEvent) => {
  const { data, ports } = event
  if (data?.type === 'CLEAR_USER_CACHE' && ports?.[0]) {
    void clearUserCache(caches, ports[0]).catch(() => undefined)
  }
})

/**
 * A push message of the adapter (`channels/web-push.ts`, WP-M14-125): the first
 * line is the title, the rest the body and an optional last block
 * `<label>: <url>` the deep link. The label is the translated
 * `notification.action_label` of the server, so the parser never hard-codes a
 * locale.
 */
export interface PushNotification {
  title: string
  body: string
  url: string
}

const DEEP_LINK = /^[^:\n]+: (https?:\/\/\S+)$/

export function notificationFromPayload(payload: string): PushNotification {
  const [first = '', ...rest] = payload.split('\n')
  let body = rest.join('\n').trim()
  let url = ''

  const lastBreak = body.lastIndexOf('\n\n')
  const candidate = lastBreak === -1 ? body : body.slice(lastBreak + 2)
  const match = DEEP_LINK.exec(candidate)

  if (match !== null) {
    url = match[1] ?? ''
    body = lastBreak === -1 ? '' : body.slice(0, lastBreak)
  }

  return { title: first.trim() === '' ? 'StörDesk' : first.trim(), body, url }
}

interface PushClient {
  url: string
  focus(): Promise<unknown>
  /** Navigates the window to a url of its own origin. */
  navigate(url: string): Promise<unknown>
  /** Asks the page for the sound of the alarm (§11.17, ADR-0048). */
  postMessage(message: { type: string }): void
}

/** The one part of `ServiceWorkerGlobalScope` the push handlers use. */
interface PushScope {
  registration: {
    showNotification(
      title: string,
      options: {
        body: string
        icon: string
        data: { url: string }
        /** An alarm of StörDesk stays visible until the user acts on it. */
        requireInteraction: boolean
        /** A short pattern for the phones that can vibrate. */
        vibrate: number[]
      },
    ): Promise<void>
  }
  clients: {
    matchAll(options: { type: string; includeUncontrolled: boolean }): Promise<PushClient[]>
    openWindow(url: string): Promise<unknown>
  }
  /** The origin of the service worker — the base of a relative deep link. */
  location: { origin: string }
}

/** The origin of a url, or an empty string for a url that cannot be read. */
function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/** The path of a url, or an empty string for a url that cannot be read. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

/**
 * Opens the deep link of a clicked notification: the **running app** is brought
 * to the front and navigated to the link; a window opens it only when the app
 * is not open at all.
 *
 * The app is a single-page application: the url of an open window is the url of
 * the document that was loaded and never changes while the user navigates
 * inside the app (MDN: "this technique is not suitable for SPAs"). A comparison
 * of the whole url would therefore never match, and every click would open
 * **another** window — on Windows a new top-level window of the installed app
 * with a process of its own, while the running app stayed on the old page. The
 * window of the app is found by its **origin** and navigated to the deep link
 * (`client.navigate`), so the ticket opens in the app that is already running
 * and the browser keeps one window.
 *
 * A deep link of another origin (the `PWA_URL` of the installation points
 * somewhere else) is opened as a window: a window of this origin cannot be
 * navigated to a foreign url.
 */
export async function focusOrOpen(
  clients: PushScope['clients'],
  url: string,
  origin: string,
): Promise<void> {
  const target = new URL(url === '' ? '/' : url, origin).href
  const open = await clients.matchAll({ type: 'window', includeUncontrolled: true })

  if (originOf(target) === origin) {
    const sameOrigin = open.filter((client) => originOf(client.url) === origin)
    const exact = sameOrigin.find((client) => pathOf(client.url) === pathOf(target))
    const chosen = exact ?? sameOrigin[0]

    if (chosen !== undefined) {
      try {
        await chosen.focus()

        if (exact === undefined) {
          await chosen.navigate(target)
        }

        return
      } catch {
        // The window refused the focus — the link is opened as a window below.
      }
    }
  }

  await clients.openWindow(target)
}

/**
 * Asks the open pages for the sound of the alarm (`specs/10-notifications.md`
 * §11.17, ADR-0048): a service worker has no Web Audio, only a page may play
 * a tone. The page decides — the sound of the installation, no silence of the
 * user, a gesture given (`components/alarm-banner.tsx`).
 */
export async function requestAlarmTone(clients: PushScope['clients']): Promise<void> {
  const open = await clients.matchAll({ type: 'window', includeUncontrolled: true })

  for (const client of open) {
    client.postMessage({ type: 'PLAY_ALARM_TONE' })
  }
}

self.addEventListener('push', (event: Event) => {
  const push = event as Event & {
    data?: { text(): string }
    waitUntil(promise: Promise<unknown>): void
  }
  const { title, body, url } = notificationFromPayload(push.data?.text() ?? '')
  const scope = self as unknown as PushScope

  push.waitUntil(
    (async () => {
      await scope.registration.showNotification(title, {
        body,
        icon: '/logo.png',
        data: { url },
        // StörDesk is an alarm system: a pushed alarm must not vanish after a few
        // seconds while nobody looked. The notification stays until the user
        // closes it or opens the ticket, and a phone vibrates the same pattern.
        requireInteraction: true,
        vibrate: [200, 100, 200],
      })

      await requestAlarmTone(scope.clients)
    })(),
  )
})

self.addEventListener('notificationclick', (event: Event) => {
  const click = event as Event & {
    notification?: { close(): void; data?: { url?: string } }
    waitUntil(promise: Promise<unknown>): void
  }
  const scope = self as unknown as PushScope

  click.notification?.close()
  click.waitUntil(
    focusOrOpen(scope.clients, click.notification?.data?.url ?? '', scope.location.origin),
  )
})
