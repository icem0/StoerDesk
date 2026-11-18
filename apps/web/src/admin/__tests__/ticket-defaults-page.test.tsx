import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { TicketDefaultsPage } from '../ticket-defaults-page'

/**
 * The administration of the standard values (ADR-0029, WP-M14-134g): the page
 * shows the standard of the priority and the list of the deviations.
 */

const adminId = '11111111-1111-4111-8111-111111111111'

function meResponse(permissions: string[]) {
  return {
    user: { id: adminId, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
}

const overrides = {
  overrides: [
    {
      objectId: '22222222-2222-4222-8222-222222222222',
      objectNo: '12345_01',
      objectName: 'Klinik Nord',
      priority: 'critical',
    },
  ],
}

function stubRoutes(routes: Record<string, unknown>, calls?: { method: string; body: unknown }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      calls?.push({
        method: init?.method ?? 'GET',
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          if (payload instanceof Response) {
            return payload
          }

          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/defaults']}>
          <TicketDefaultsPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TicketDefaultsPage', () => {
  it('shows the standard and the deviations', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read']),
      '/v1/settings/ticket-defaults/overrides': overrides,
      '/v1/settings/ticket-defaults': { priority: 'normal' },
    })
    renderPage()

    expect(await screen.findByText('Standardwerte')).toBeTruthy()
    expect(await screen.findByText('12345_01')).toBeTruthy()
    expect(screen.getByText('Klinik Nord')).toBeTruthy()

    const row = screen.getByText('12345_01').closest('tr')

    expect(within(row!).getByText('Kritisch')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('normal')
  })

  it('saves a new standard', async () => {
    const calls: { method: string; body: unknown }[] = []

    stubRoutes(
      {
        '/v1/me': meResponse(['settings.read', 'settings.write']),
        '/v1/settings/ticket-defaults/overrides': overrides,
        '/v1/settings/ticket-defaults': { priority: 'normal' },
      },
      calls,
    )
    renderPage()

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() =>
      expect(calls.some((call) => call.method === 'PUT')).toBe(true),
    )
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ priority: 'high' })
  })

  it('refuses the page without settings.read', async () => {
    stubRoutes({ '/v1/me': meResponse([]) })
    renderPage()

    expect(await screen.findByText('Keine Berechtigung für die Standardwerte.')).toBeTruthy()
  })

  it('keeps the standard read-only without settings.write', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read']),
      '/v1/settings/ticket-defaults/overrides': { overrides: [] },
      '/v1/settings/ticket-defaults': { priority: 'normal' },
    })
    renderPage()

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement

    expect(select.disabled).toBe(true)
  })
})
