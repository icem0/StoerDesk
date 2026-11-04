import { precacheAndRoute } from 'workbox-precaching'
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { registerRoute } from 'workbox-routing'

import { isInternalTicketRead, isPublicReportPath } from './lib/sw-routes'

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
    cacheName: 'internal-tickets',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 12 * 3600 })],
  }),
  'GET',
)
