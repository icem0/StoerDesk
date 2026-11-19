import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { StatusCreatePage } from '../status-create-page'

const listMarker = 'Statusliste'

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      theme: 'auto',
      roles: ['admin'],
      permissions,
    },
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/statuses/new']}>
          <Routes>
            <Route path="/admin/statuses/new" element={<StatusCreatePage />} />
            <Route path="/admin/statuses" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StatusCreatePage', () => {
  it('shows the form of a new status on its own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['settings.read', 'settings.write']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Status anlegen' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Statusverwaltung' })).toBeTruthy()
  })

  it('creates the status and returns to the table', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['settings.read', 'settings.write']))
      }

      if (url.includes('/v1/admin/statuses') && init?.method === 'POST') {
        return Response.json({
          key: 'NEW',
          nameDe: 'Neu',
          nameEn: 'New',
          color: '#6b7280',
          position: 0,
          active: true,
          isTerminal: false,
          ticketCount: 0,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Schl.'), {
      target: { value: 'NEW' },
    })
    fireEvent.change(screen.getByLabelText('Name (de)'), { target: { value: 'Neu' } })
    fireEvent.change(screen.getByLabelText('Name (en)'), { target: { value: 'New' } })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"key":"NEW"')
    })

    expect(await screen.findByText(listMarker)).toBeTruthy()
  })

  it('shows the read-only notice without settings.write', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['settings.read']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByText(/Only readable/)).toBeTruthy()
  })
})
