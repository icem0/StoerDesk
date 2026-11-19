import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { DetectedErrorCreatePage } from '../detected-error-create-page'

const listMarker = 'Fehlerliste'

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
        <MemoryRouter initialEntries={['/admin/detected-errors/new']}>
          <Routes>
            <Route path="/admin/detected-errors/new" element={<DetectedErrorCreatePage />} />
            <Route path="/admin/detected-errors" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DetectedErrorCreatePage', () => {
  it('shows the form of a new detected error on its own page', async () => {
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

    expect(
      await screen.findByRole('heading', { name: 'Festgestellten Fehler anlegen' }),
    ).toBeTruthy()
    expect(screen.getByLabelText('Schlüssel')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Festgestellte Fehler' })).toBeTruthy()
  })

  it('creates the detected error and returns to the list', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['settings.read', 'settings.write']))
      }

      if (url.includes('/v1/detected-errors') && init?.method === 'POST') {
        return Response.json({
          key: 'kabelbruch',
          labelDe: 'Kabelbruch',
          labelEn: 'Cable break',
          archivedAt: null,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Schlüssel'), {
      target: { value: 'kabelbruch' },
    })
    fireEvent.change(screen.getByLabelText('Deutscher Text'), {
      target: { value: 'Kabelbruch' },
    })
    fireEvent.change(screen.getByLabelText('Englischer Text'), {
      target: { value: 'Cable break' },
    })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"key":"kabelbruch"')
    })

    expect(await screen.findByText(listMarker)).toBeTruthy()
  })

  it('shows the forbidden notice without settings.write', async () => {
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

    expect(
      await screen.findByText('Keine Berechtigung für die Verwaltung der festgestellten Fehler.'),
    ).toBeTruthy()
  })
})
