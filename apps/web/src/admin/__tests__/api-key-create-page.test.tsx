import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { ApiKeyCreatePage } from '../api-key-create-page'

const token = `sk_${'a'.repeat(43)}`

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
        <MemoryRouter initialEntries={['/admin/api-keys/new']}>
          <ApiKeyCreatePage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApiKeyCreatePage', () => {
  it('shows the form of a new key on its own page', async () => {
    stub({ me: meResponse(['apikey.read', 'apikey.write']), list: { keys: [] } })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Neuen Schlüssel anlegen' })).toBeTruthy()
    expect(screen.getByLabelText(/Bezeichnung/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'API-Schlüssel' })).toBeTruthy()
  })

  it('creates a key and shows the plaintext token once', async () => {
    stub({
      me: meResponse(['apikey.read', 'apikey.write']),
      list: { keys: [] },
      created: { key: summary, token },
    })
    renderPage()

    fireEvent.change(await screen.findByLabelText(/Bezeichnung/), {
      target: { value: 'Monitoring' },
    })
    fireEvent.click(screen.getByText('Schlüssel anlegen'))

    expect(await screen.findByText('Schlüssel einmalig sichtbar')).toBeTruthy()
    expect(screen.getByText(token)).toBeTruthy()

    fireEvent.click(screen.getByText('Schließen'))
    expect(screen.queryByText(token)).toBeNull()
  })

  it('shows the read-only notice without apikey.write', async () => {
    stub({ me: meResponse(['apikey.read']), list: { keys: [] } })
    renderPage()

    expect(await screen.findByText(/Nur Lesen/)).toBeTruthy()
  })
})
