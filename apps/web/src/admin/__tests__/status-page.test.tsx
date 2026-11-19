import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { StatusPage } from '../status-page'

const adminId = '11111111-1111-4111-8111-111111111111'

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          if (payload instanceof Response) {
            return payload
          }

          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function meResponse(permissions: string[]) {
  return {
    user: { id: adminId, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
}

const statusList = {
  statuses: [
    {
      key: 'NEW',
      nameDe: 'Neu',
      nameEn: 'New',
      color: '#6b7280',
      position: 1,
      active: true,
      isTerminal: false,
      ticketCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      key: 'IN_REVIEW',
      nameDe: 'In Prüfung',
      nameEn: 'In Review',
      color: '#d97706',
      position: 2,
      active: true,
      isTerminal: false,
      ticketCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      key: 'CLOSED',
      nameDe: 'Abgeschlossen',
      nameEn: 'Closed',
      color: '#16a34a',
      position: 6,
      active: true,
      isTerminal: true,
      ticketCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      key: 'DRAFT',
      nameDe: 'Tastatur',
      nameEn: 'Draft',
      color: '#7c3aed',
      position: 7,
      active: false,
      isTerminal: false,
      ticketCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/statuses']}>
          <StatusPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StatusPage', () => {
  it('renders the status table for a session with settings.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['settings.read']), '/v1/admin/statuses': statusList })
    renderPage()

    expect(await screen.findByText('NEW')).toBeTruthy()
    expect(screen.getByText('IN_REVIEW')).toBeTruthy()
    expect(screen.getByText('Statusverwaltung')).toBeTruthy()
    expect(screen.getByText('final')).toBeTruthy()
    expect(screen.getByText('inactive')).toBeTruthy()
    expect(screen.queryByText('Anlegen')).toBeNull()
  })

  it('offers create, edit and delete controls with settings.write', async () => {
    stubRoutes({ '/v1/me': meResponse(['settings.read', 'settings.write']), '/v1/admin/statuses': statusList })
    renderPage()

    expect(await screen.findByText('NEW')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Status anlegen' })).toBeTruthy()
    expect(screen.getAllByText('Bearbeiten')).toHaveLength(4)
    expect(screen.getAllByText('Lösch')).toHaveLength(4)
  })

  it('shows the session notice when /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderPage()

    expect(await screen.findByText(/Status administration requires a valid login/)).toBeTruthy()
  })

  it('shows the forbidden notice without settings.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['user.read']) })
    renderPage()

    expect(await screen.findByText('No permission for the Status administration.')).toBeTruthy()
  })

  it('a status a ticket still carries is never deleted', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/admin/statuses/NEW': Response.json(
        { code: 'status_in_use', params: { key: 'NEW', usageCount: 3 } },
        { status: 409 },
      ),
      '/v1/admin/statuses': statusList,
    })
    renderPage()

    await screen.findByText('NEW')
    const [firstDelete] = screen.getAllByText('Lösch')
    await vi.waitFor(() => void firstDelete?.click())

    expect(await screen.findByText(/Remove the status NEW permanently/)).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Entfernen' })
    await vi.waitFor(() => void confirm.click())

    expect(await screen.findByText('Tickets still use this status.')).toBeTruthy()
  })

  it('the last active status is never deleted and the error names the rule', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/admin/statuses/IN_REVIEW': Response.json(
        { code: 'status_last_active', params: { key: 'IN_REVIEW' } },
        { status: 409 },
      ),
      '/v1/admin/statuses': statusList,
    })
    renderPage()

    await screen.findByText('IN_REVIEW')
    const [, secondDelete] = screen.getAllByText('Lösch')
    await vi.waitFor(() => void secondDelete?.click())

    expect(await screen.findByText(/Remove the status IN_REVIEW permanently/)).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Entfernen' })
    await vi.waitFor(() => void confirm.click())

    expect(await screen.findByText('The last active status can neither be switched off nor deleted.')).toBeTruthy()
  })
})
