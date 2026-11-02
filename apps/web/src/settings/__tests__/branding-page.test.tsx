import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { BrandingPage } from '../branding-page'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/branding']}>
          <Routes>
            <Route path="/admin/branding" element={<BrandingPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubSessionAndBranding(permissions: string[], branding: { companyName: string }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.endsWith('/v1/me')) {
      return Response.json({
        user: { email: 'admin@example.com', roles: ['admin'], permissions },
      })
    }

    if (url.endsWith('/settings/branding')) {
      const request = input as Request

      if (request.method === 'PUT') {
        const body = (await request.json()) as { companyName?: string }
        return Response.json({ companyName: body.companyName ?? '' })
      }

      return Response.json(branding)
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BrandingPage', () => {
  it('prefills the company name from the API and saves the typed value', async () => {
    const fetchMock = stubSessionAndBranding(
      ['settings.read', 'settings.write'],
      { companyName: 'Beispiel GmbH' },
    )
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const input = (await screen.findByLabelText(/Firmenname|Company name/i)) as HTMLInputElement
    expect(input.value).toBe('Beispiel GmbH')

    fireEvent.change(input, { target: { value: 'Neue GmbH' } })
    fireEvent.click(screen.getByRole('button', { name: /Speichern|Save/i }))

    await expect(
      screen.findByText(/Gespeichert\.|Saved\./i),
    ).resolves.toBeTruthy()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/settings/branding',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ companyName: 'Neue GmbH' }),
      }),
    )
  })

  it('disables the save button without settings.write', async () => {
    const fetchMock = stubSessionAndBranding(['settings.read'], {
      companyName: 'Beispiel GmbH',
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const button = (await screen.findByRole('button', { name: /Speichern|Save/i })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('shows the session error when the user is not signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json(
            { code: 'session_invalid', params: {} },
            { status: 401 },
          )
        }
        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage(vi.fn())

    expect(await screen.findByText(/Die Sitzung ist abgelaufen|Your session has expired/i)).toBeTruthy()
  })
})
