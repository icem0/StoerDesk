import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { OncallPoolCreatePage } from '../oncall-pool-create-page'

const listMarker = 'Poolliste'

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
        <MemoryRouter initialEntries={['/admin/oncall/pools/new']}>
          <Routes>
            <Route path="/admin/oncall/pools/new" element={<OncallPoolCreatePage />} />
            <Route path="/admin/oncall" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OncallPoolCreatePage', () => {
  it('shows the form of a new pool on its own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['oncall.admin']))
        }

        if (url.includes('/v1/groups')) {
          return Response.json({ groups: [] })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Pool anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pools' })).toBeTruthy()
  })

  it('creates the pool and returns to the readiness administration', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['oncall.admin']))
      }

      if (url.includes('/v1/groups')) {
        return Response.json({ groups: [] })
      }

      if (url.includes('/v1/oncall/pools') && init?.method === 'POST') {
        return Response.json({
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Verwaltung',
          groupId: null,
          active: true,
          updatedAt: '2026-11-19T10:00:00.000Z',
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Verwaltung' } })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"name":"Verwaltung"')
    })

    expect(await screen.findByText(listMarker)).toBeTruthy()
  })

  it('shows the forbidden notice without oncall.admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['oncall.read']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByText(/fehlt die Berechtigung/)).toBeTruthy()
  })
})
