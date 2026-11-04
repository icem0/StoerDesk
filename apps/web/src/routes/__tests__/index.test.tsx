import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { routes } from '../index'

const fetchCalls: { url: string }[] = []

function stubRoutes() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      fetchCalls.push({ url })

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'admin@example.com',
            locale: 'de',
            roles: ['admin'],
            permissions: ['system.update'],
          },
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderRoute(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('route table', () => {
  it('shows the not found page for an unknown address', async () => {
    stubRoutes()

    renderRoute('/gibt-es-nicht')

    expect(await screen.findByText('Seite nicht gefunden')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toBeTruthy()
  })

  it('leads the retired update page to the administration home', async () => {
    stubRoutes()

    renderRoute('/admin/update')

    await waitFor(() => {
      expect(screen.getByText('Verwaltung')).toBeTruthy()
    })
  })
})
