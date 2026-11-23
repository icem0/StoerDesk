import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { ApiKeysPage } from '../api-keys-page'

const summary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Monitoring',
  prefix: 'sk_abcd',
  scopes: ['objects:read'],
  createdBy: null,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-11-10T10:00:00.000Z',
}

function meResponse(permissions: string[]) {
  return {
    user: { id: summary.id, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
}

function stub(routes: { me: unknown; list?: unknown; created?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) return Response.json(routes.me)
      if (url.includes('/v1/api-keys')) {
        if (init?.method === 'POST') return Response.json(routes.created, { status: 201 })
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        return Response.json(routes.list ?? { keys: [] })
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
        <MemoryRouter initialEntries={['/admin/api-keys']}>
          <ApiKeysPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApiKeysPage', () => {
  it('lists keys and hides the create form without apikey.write', async () => {
    stub({ me: meResponse(['apikey.read']), list: { keys: [summary] } })
    renderPage()

    expect(await screen.findByText('Monitoring')).toBeTruthy()
    expect(screen.queryByText('Neuen Schlüssel anlegen')).toBeNull()
    expect(screen.getByText(/apikey.write/)).toBeTruthy()
  })

  it('offers the button of the own page of a new key with apikey.write', async () => {
    stub({ me: meResponse(['apikey.read', 'apikey.write']), list: { keys: [] } })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Neuen Schlüssel anlegen' })).toBeTruthy()
  })

  it('shows the forbidden notice without apikey.read', async () => {
    stub({ me: meResponse(['user.read']) })
    renderPage()

    expect(await screen.findByText('Keine Berechtigung.')).toBeTruthy()
  })

  it('carries the actions of the row in the menu and asks before the revoke', async () => {
    stub({ me: meResponse(['apikey.read', 'apikey.write']), list: { keys: [summary] } })
    renderPage()

    expect(await screen.findByText('Monitoring')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    const revoke = screen.getByRole('menuitem', { name: 'Widerrufen' })

    expect(revoke).toBeTruthy()

    fireEvent.click(revoke)

    expect(screen.getByRole('button', { name: 'Wirklich widerrufen?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeTruthy()
  })
})
