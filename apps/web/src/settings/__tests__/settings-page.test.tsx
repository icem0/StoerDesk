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
    // summary-Element, nicht als h2.
    expect(screen.getByText('Verwaltung')).toBeTruthy()

    // Den aufklappbaren Verwaltungs-Abschnitt öffnen, damit seine Links sichtbar werden.
    fireEvent.click(screen.getByText('Verwaltung'))
    await waitFor(() => expect(screen.getByText('Meldungsablauf')).toBeTruthy())

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/settings/me')?.textContent).toContain('Meine Einstellungen')
    expect(linkOf('/admin/branding')?.textContent).toContain('Darstellung & Logo')
    expect(linkOf('/admin/workflow')?.textContent).toContain('Meldungsablauf')
    expect(linkOf('/admin/readiness')?.textContent).toContain('Bereitschaft')
    expect(linkOf('/admin/messaging')?.textContent).toContain('Kanäle & Versand')
    expect(linkOf('/objects/stickers')?.textContent).toContain('QR-Aufkleber')

    // The work surfaces live in the header menu and do not stand here a second time,
    // and „Meine Bereitschaft“ opens the same /oncall as the header entry.
    for (const href of ['/tickets', '/tickets/create', '/stats', '/oncall']) {
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
    // modules are behind the four topic pages of the „Verwaltung“ section.
    const administrationLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/admin'))
      .map((link) => link.getAttribute('href'))

    expect(administrationLinks).toContain('/admin/access')
    expect(administrationLinks).toContain('/admin/workflow')
    expect(administrationLinks).toContain('/admin/readiness')
    expect(administrationLinks).toContain('/admin/messaging')
    expect(administrationLinks).not.toContain('/admin')

    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeTruthy()
    expect(screen.getByLabelText('Einstellungen suchen')).toBeTruthy()

    // No channel may fail for an account without `notification.read`: the badge
    // is not rendered and the status route is never called (WP-M14-19).
    expect(screen.queryByText(/\(\d+\)$/)).toBeNull()
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

  it('shows the badge of the open delivery problems as a link to the problems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json({
            user: {
              email: 'admin@example.com',
              roles: ['admin'],
              permissions: ['notification.read'],
            },
          })
        }

        if (url.includes('/v1/notifications/delivery')) {
          return Response.json({
            problems: [
              {
                channel: 'signal',
                failed: 2,
                unacknowledged: 2,
                lastSentAt: '2026-11-13T08:00:00.000Z',
                lastFailedAt: '2026-11-13T09:30:00.000Z',
                lastSuccessAt: '2026-11-13T08:00:00.000Z',
                lastError: 'send_failed',
                acknowledgedAt: null,
                acknowledgedBy: null,
                open: true,
              },
              {
                channel: 'matrix',
                failed: 1,
                unacknowledged: 0,
                lastSentAt: null,
                lastFailedAt: '2026-11-13T09:30:00.000Z',
                lastSuccessAt: null,
                lastError: 'send_failed',
                acknowledgedAt: '2026-11-13T10:00:00.000Z',
                acknowledgedBy: 'Muster, Max',
                open: false,
              },
            ],
            failures: [],
          })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    // The badge counts the **open** problems: the quit one stays silent
    // (WP-M14-161c).
    const badge = await screen.findByRole('link', { name: /Zustellung gestört \(1\)/ })

    expect(badge.getAttribute('href')).toBe('/admin/delivery')
  })

  it('offers the page of the delivery problems in the menu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json({
            user: {
              email: 'admin@example.com',
              roles: ['admin'],
              permissions: ['notification.read'],
            },
          })
        }

        if (url.includes('/v1/notifications/delivery')) {
          return Response.json({
            problems: [
              {
                channel: 'signal',
                failed: 2,
                unacknowledged: 2,
                lastSentAt: '2026-11-13T08:00:00.000Z',
                lastFailedAt: '2026-11-13T09:30:00.000Z',
                lastSuccessAt: '2026-11-13T08:00:00.000Z',
                lastError: 'send_failed',
                acknowledgedAt: null,
                acknowledgedBy: null,
                open: true,
              },
            ],
            failures: [],
          })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    // Das Abzeichen rendert asynchron, nachdem die Zustellung abgefragt wurde.
    const badge = await screen.findByText(/Zustellung gestört \(\d+\)/)
    const link = badge.closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/admin/delivery')
  })
})
