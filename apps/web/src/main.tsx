import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider } from 'react-router-dom'

import { i18n } from './i18n'
import { router } from './routes'
import { replayOutbox } from './lib/outbox'
import './styles.css'

const queryClient = new QueryClient()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root not found')
}

// Register the service worker so the app shell is available offline
// (WP-M2-09a). Best effort: browsers without service workers or a dev server
// without /sw.js just keep working online.
if (typeof navigator.serviceWorker !== 'undefined') {
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

// Reports written while offline are replayed on app start and whenever the
// browser comes back online (WP-M2-09a).
void replayOutbox().catch(() => undefined)

if (typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    void replayOutbox().catch(() => undefined)
  })
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  </StrictMode>,
)
