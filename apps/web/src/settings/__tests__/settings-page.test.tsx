import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { SettingsPage } from '../settings-page'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsPage', () => {
  it('groups every settings destination by topic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json({
            user: { email: 'admin@example.com', roles: ['admin'], permissions: [] },
          })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeTruthy()
    expect(await screen.findByText('Angemeldet als admin@example.com')).toBeTruthy()

    for (const heading of ['Persönlich', 'Darstellung', 'Meldungen', 'Objekte', 'Verwaltung', 'Konto']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }

    expect(screen.getByRole('link', { name: 'Meine Einstellungen' }).getAttribute('href')).toBe(
      '/settings/me',
    )
    expect(screen.getByRole('link', { name: 'Darstellung' }).getAttribute('href')).toBe(
      '/admin/branding',
    )
    expect(screen.getByRole('link', { name: 'Eskalation' }).getAttribute('href')).toBe(
      '/admin/escalation',
    )
    expect(screen.getByRole('link', { name: 'QR-Aufkleber' }).getAttribute('href')).toBe(
      '/objects/stickers',
    )

    // The administration home is gone (WP-M14-01): every administration module
    // is a link of the settings menu, there is no second entry point.
    const administrationLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/admin'))
      .map((link) => link.getAttribute('href'))

    expect(administrationLinks).toContain('/admin/users')
    expect(administrationLinks).not.toContain('/admin')

    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeTruthy()
  })
})
