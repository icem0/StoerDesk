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

/** The customer of an installation signs in and lands in his portal
 *  (ADR-0061, WP-M31-17) — the frame of the app owns the way, not the form. */
function renderRouteOfCustomer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: ['/tickets'] })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return router
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

/** The answer of `/v1/me` for the customer of an installation (ADR-0061). */
function customerMe() {
  return Response.json({
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'kunde@example.com',
      locale: 'de',
      roles: ['customer'],
      permissions: [],
    },
  })
}

describe('route table', () => {
  it('shows the not found page for an unknown address', async () => {
    stubRoutes()

    renderRoute('/gibt-es-nicht')

    expect(await screen.findByText('Seite nicht gefunden')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toBeTruthy()
  })

  it('leads the retired update page to the settings menu', async () => {
    stubRoutes()

    renderRoute('/admin/update')

    await waitFor(() => {
      expect(screen.getByText('Einstellungen')).toBeTruthy()
    })
  })

  it('leads the retired administration home to the settings menu', async () => {
    stubRoutes()

    renderRoute('/admin')

    await waitFor(() => {
      expect(screen.getByText('Einstellungen')).toBeTruthy()
    })
  })

  it('leads the customer of an installation into his portal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/v1/me') ? customerMe() : Response.json({ code: 'not_found' }, { status: 404 }),
      ),
    )

    const router = renderRouteOfCustomer()

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/portal')
    })
  })

  it.each(['/settings', '/admin/users', '/admin/roles', '/admin/channels'])(
    'renders %s with exactly one landmark',
    async (path) => {
      stubRoutes()

      const { container } = renderRoute(path)

      await waitFor(() => {
        expect(container.querySelectorAll('main').length).toBe(1)
      })
    },
  )
})
