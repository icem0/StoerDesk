import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { WebhookCreatePage } from '../webhook-create-page'

const secret = 'whsec_0123456789abcdef'

const summary = {
  id: '11111111-1111-4111-8111-111111111111',
  url: 'https://example.org/hook',
  events: ['ticket.created'],
  active: true,
  createdAt: '2026-11-10T10:00:00.000Z',
}

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      roles: ['admin'],
      permissions,
    },
  }
}

function stub(routes: { me: unknown; list?: unknown; created?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) return Response.json(routes.me)
      if (url.includes('/v1/webhooks')) {
        if (init?.method === 'POST') return Response.json(routes.created, { status: 201 })
        return Response.json(routes.list ?? { webhooks: [] })
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
        <MemoryRouter initialEntries={['/admin/webhooks/new']}>
          <WebhookCreatePage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebhookCreatePage', () => {
  it('shows the form of a new webhook on its own page', async () => {
    stub({ me: meResponse(['settings.read', 'settings.write']) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Neuen Endpunkt anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('URL')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Webhooks' })).toBeTruthy()
  })

  it('creates the webhook and shows the signing secret once', async () => {
    stub({
      me: meResponse(['settings.read', 'settings.write']),
      created: { webhook: summary, secret },
    })
    renderPage()

    fireEvent.change(await screen.findByLabelText('URL'), {
      target: { value: 'https://example.org/hook' },
    })
    fireEvent.click(screen.getByText('Endpunkt anlegen'))

    expect(await screen.findByText('Signatur-Schlüssel einmalig sichtbar')).toBeTruthy()
    expect(screen.getByText(secret)).toBeTruthy()

    fireEvent.click(screen.getByText('Schließen'))
    expect(screen.queryByText(secret)).toBeNull()
  })

  it('shows the read-only notice without settings.write', async () => {
    stub({ me: meResponse(['settings.read']) })
    renderPage()

    expect(await screen.findByText(/Nur Lesen/)).toBeTruthy()
  })
})
