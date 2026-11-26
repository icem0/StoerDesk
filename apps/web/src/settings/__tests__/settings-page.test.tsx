import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  it('groups every settings destination by topic in one column', async () => {
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

    for (const heading of [
      'Mein Bereich',
      'Darstellung',
      'Objekte',
      'Konto',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }

    // „Verwaltung“ ist ein aufklappbarer Abschnitt: seine Überschrift steht im
    // summary-Element, nicht als h2. Der Abschnitt ist offen — die Pfade der
    // Verwaltung stehen ohne zweiten Klick da.
    expect(screen.getByText('Verwaltung')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Benutzer')).toBeTruthy())

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/settings/me')?.textContent).toContain('Meine Einstellungen')
    expect(linkOf('/settings/notifications')?.textContent).toContain('Benachrichtigungen')
    expect(linkOf('/oncall')?.textContent).toContain('Meine Bereitschaft')
    expect(linkOf('/admin/branding')?.textContent).toContain('Darstellung & Logo')
    expect(linkOf('/admin/dashboard')?.textContent).toContain('Dashboard & TV')
    expect(linkOf('/objects')?.textContent).toContain('Objekte')
    expect(linkOf('/objects/stickers')?.textContent).toContain('QR-Aufkleber')
    expect(linkOf('/admin/sticker-template')?.textContent).toContain('Sticker-Vorlage')

    // Every module of the administration keeps its path (WP-M29-06).
    const modules: [string, string][] = [
      ['/admin/users', 'Benutzer'],
      ['/admin/roles', 'Rollen'],
      ['/admin/groups', 'Gruppen'],
      ['/admin/statuses', 'Status'],
      ['/admin/text-templates', 'Störungsarten'],
      ['/admin/detected-errors', 'Festgestellte Fehler'],
      ['/admin/escalation', 'Eskalation'],
      ['/admin/defaults', 'Standardwerte'],
      ['/admin/oncall', 'Bereitschaftsplan'],
      ['/admin/channels', 'Kanäle'],
      ['/admin/delivery', 'Zustellungsprobleme'],
      ['/admin/email', 'Mailbox des Betriebs'],
      ['/admin/webhooks', 'Webhooks'],
      ['/admin/api-keys', 'API-Schlüssel'],
      ['/admin/bma-sync', 'BMAcloud-Abgleich'],
    ]

    for (const [href, label] of modules) {
      expect(linkOf(href)?.textContent).toContain(label)
    }

    // The work surfaces live in the header menu and do not stand here a second time.
    for (const href of ['/tickets', '/tickets/create', '/stats']) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull()
    }

    // Every entry carries its symbol (the delivery badge above the groups is
    // not a menu entry and has no list item).
    for (const link of screen.getAllByRole('link')) {
      const row = link.closest('li')
      if (!row) {
        continue
      }
      expect(row.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    }

    // The administration home is gone: there is no link to /admin itself, the
    // modules stand in the menu of the settings.
    const administrationLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/admin'))
      .map((link) => link.getAttribute('href'))

    expect(administrationLinks).toContain('/admin/users')
    expect(administrationLinks).toContain('/admin/channels')
    expect(administrationLinks).not.toContain('/admin')

    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeTruthy()
    expect(screen.getByLabelText('Einstellungen suchen')).toBeTruthy()

    // The page carries no badge of a failed delivery (ADR-0062): the failure is
    // a task in the mailbox of the administration, not a warning here.
    expect(screen.queryByText(/Zustellung gestört/)).toBeNull()
  })

  it('finds entries through the search field', async () => {
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

    const input = screen.getByLabelText('Einstellungen suchen')
    input.focus()
    fireEvent.input(input, { target: { value: 'Logo' } })

    expect(screen.getByText('Darstellung & Logo')).toBeTruthy()
    expect(screen.queryByText('Meine Einstellungen')).toBeNull()
  })
})
