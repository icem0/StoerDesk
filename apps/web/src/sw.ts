import { precacheAndRoute } from 'workbox-precaching'
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { NetworkOnly } from 'workbox-strategies'
import { registerRoute } from 'workbox-routing'

import { isPublicReportPath } from './lib/sw-routes'
import { appVersion } from './lib/version'

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
 * Clean-update control (specs/18-self-update.md §18.2, WP-M2-44). The admin
 * update page posts `SKIP_WAITING`, `GET_VERSION` or `CLEAR_CACHES`. The narrow
 * scope type is needed because this project typechecks the web workspace with
 * the DOM lib and not with the Web Worker lib.
 */
type UpdateMessageEvent = {
  data: unknown
  ports: MessagePort[]
  waitUntil: (promise: Promise<void>) => void
}

type UpdateWorkerScope = {
  addEventListener: (type: 'message', listener: (event: UpdateMessageEvent) => void) => void
  skipWaiting: () => Promise<ServiceWorkerRegistration>
}

const scope = self as unknown as UpdateWorkerScope

scope.addEventListener('message', (event) => {
  const port = event.ports[0]

  if (event.data === 'SKIP_WAITING') {
    void scope.skipWaiting()
    port?.postMessage('SKIP_WAITING_DONE')

    return
  }

  if (event.data === 'GET_VERSION') {
    port?.postMessage(appVersion)

    return
  }

  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => {
          port?.postMessage('CLEAR_CACHES_DONE')
        }),
    )
  }
})
