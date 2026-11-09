import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { Shell } from '../Shell'

const marker = 'guarded-area'

function stubMe(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/me')) {
        return response instanceof Response ? response : Response.json(response)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderShell(path = '/admin/users') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Shell />}>
              <Route path={path} element={<p>{marker}</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function signedInMe() {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      theme: 'auto',
      roles: ['admin'],
      permissions: ['user.read', 'role.read', 'object.read'],
    },
  }
}

/** jsdom has no `matchMedia` — the shell asks it for the system theme (WP-M2-92d). */
function stubMatchMedia(prefersLight: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersLight,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Shell settings menu', () => {
  it('opens the existing pages from the gear next to the version', async () => {
    stubMe(signedInMe())
    renderShell()

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(screen.getByTestId('app-version')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Benutzerverwaltung' })).toBeNull()

    const gear = screen.getByRole('button', { name: 'Einstellungen' })
    fireEvent.click(gear)

    expect(gear.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'Benutzerverwaltung' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rollenverwaltung' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'QR-Aufkleber' })).toBeTruthy()
    expect(screen.getByText('Angemeldet als admin@example.com')).toBeTruthy()

    fireEvent.click(gear)
    expect(screen.queryByRole('link', { name: 'Benutzerverwaltung' })).toBeNull()
  })

  it('closes the menu on Escape', async () => {
    stubMe(signedInMe())
    renderShell()

    fireEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))
    expect(screen.getByRole('link', { name: 'Rollenverwaltung' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: 'Rollenverwaltung' })).toBeNull()
  })

  function stubSessionAndBranding(permissions: string[], branding: { companyName: string }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/me')) {
        return Response.json({
          user: { email: 'admin@example.com', roles: ['admin'], permissions },
        })
      }

      if (url.endsWith('/settings/branding')) {
        return Response.json(branding)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
  }

  it('shows the configured company name next to the product name', async () => {
    const fetchMock = stubSessionAndBranding(['user.read'], { companyName: 'Beispiel GmbH' })
    vi.stubGlobal('fetch', fetchMock)

    renderShell()

    expect(
      await screen.findByText(/Beispiel GmbH/),
    ).toBeTruthy()
  })

  it('shows only the product name without a company name', async () => {
    const fetchMock = stubSessionAndBranding(['user.read'], { companyName: '' })
    vi.stubGlobal('fetch', fetchMock)

    renderShell()

    expect(await screen.findByText('StörDesk')).toBeTruthy()
  })

  it('links the branding page from the settings menu', async () => {
    const fetchMock = stubSessionAndBranding(['settings.read'], { companyName: 'Beispiel GmbH' })
    vi.stubGlobal('fetch', fetchMock)

    renderShell()

    await fireEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))

    const branding = screen.getByRole('link', { name: 'Darstellung' })
    expect(branding.getAttribute('href')).toBe('/admin/branding')
  })

  it('links the deadlines and personal settings pages from the settings menu', async () => {
    stubMe(signedInMe())
    renderShell()

    fireEvent.click(await screen.findByRole('button', { name: 'Einstellungen' }))

    expect(screen.getByRole('link', { name: 'Fristen' }).getAttribute('href')).toBe(
      '/admin/deadlines',
    )
    expect(screen.getByRole('link', { name: 'Meine Einstellungen' }).getAttribute('href')).toBe(
      '/settings/me',
    )
  })


  it('shows the top-level header links without opening the menu', async () => {
    stubMe(signedInMe())
    renderShell()

    const dashboard = screen.getByRole('link', { name: 'Dashboard' })
    const tickets = screen.getByRole('link', { name: 'Tickets' })
    expect(dashboard.getAttribute('href')).toBe('/')
    expect(tickets.getAttribute('href')).toBe('/tickets')
    expect(dashboard.getAttribute('aria-current')).toBeNull()
    expect(tickets.getAttribute('aria-current')).toBeNull()
  })

  it('marks the ticket link as active on /tickets', async () => {
    stubMe(signedInMe())
    renderShell('/tickets')

    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'Tickets' }).getAttribute('aria-current')).toBe('page')
  })


  it('shows no gear while the session is anonymous', async () => {
    stubMe(Response.json({ code: 'session_invalid', params: {} }, { status: 401 }))
    renderShell()

    expect(await screen.findByText('Anmeldung')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Einstellungen' })).toBeNull()
    expect(screen.getByTestId('app-version')).toBeTruthy()
  })

  it('applies the theme of the signed-in user on the shell root', async () => {
    stubMe({
      user: { ...signedInMe().user, theme: 'light' },
    })
    renderShell()

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(document.querySelector('.theme-light')).toBeTruthy()
  })

  it('resolves the theme auto to the system preference', async () => {
    stubMatchMedia(true)
    stubMe(signedInMe())
    renderShell()

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(document.querySelector('.theme-light')).toBeTruthy()
  })
})
