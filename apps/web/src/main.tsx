import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider } from 'react-router-dom'

import { i18n } from './i18n'
import { router } from './routes'
import './styles.css'

const queryClient = new QueryClient()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root not found')
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
