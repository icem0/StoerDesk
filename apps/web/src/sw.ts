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
