import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { TextTemplateCreatePage } from '../text-template-create-page'

const listMarker = 'Störungsartenliste'

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
        <MemoryRouter initialEntries={['/admin/text-templates/new']}>
          <Routes>
            <Route path="/admin/text-templates/new" element={<TextTemplateCreatePage />} />
            <Route path="/admin/text-templates" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TextTemplateCreatePage', () => {
  it('shows the form of a new fault type on its own page', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Störungsart anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('Schlüssel')).toBeTruthy()
    expect(screen.getByLabelText('Deutscher Text')).toBeTruthy()
    expect(screen.getByLabelText('Englischer Text')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Störungsarten' })).toBeTruthy()
  })

  it('creates the fault type and returns to the list', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['settings.read', 'settings.write']))
      }

      if (url.includes('/v1/text-templates') && init?.method === 'POST') {
        return Response.json({
          id: '22222222-2222-4222-8222-222222222222',
          key: 'stromausfall',
          archivedAt: null,
          translations: { de: 'Stromausfall', en: 'Power failure' },
          usageCount: 0,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Schlüssel'), {
      target: { value: 'stromausfall' },
    })
    fireEvent.change(screen.getByLabelText('Deutscher Text'), {
      target: { value: 'Stromausfall' },
    })
    fireEvent.change(screen.getByLabelText('Englischer Text'), {
      target: { value: 'Power failure' },
    })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"key":"stromausfall"')
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
      await screen.findByText('Keine Berechtigung für die Störungsarten-Verwaltung.'),
    ).toBeTruthy()
  })
})
