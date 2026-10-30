import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { RolesPage } from '../roles-page'

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

const roleList = {
  roles: [
    {
      id: adminId,
      key: 'admin',
      isSystem: true,
      permissionKeys: ['user.read', 'user.write'],
      userCount: 1,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'office',
      isSystem: true,
      permissionKeys: [],
      userCount: 3,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      key: 'dispatcher',
      isSystem: false,
      permissionKeys: ['ticket.read'],
      userCount: 0,
    },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RolesPage />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RolesPage', () => {
  it('renders the role table for a session with role.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['role.read']), '/v1/roles': roleList })
    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()
    expect(screen.getByText('Rollenverwaltung')).toBeTruthy()
    expect(screen.getByText('office')).toBeTruthy()
    expect(screen.queryByText('Rolle anlegen')).toBeNull()
  })

  it('offers create and edit controls with role.write and keeps system roles read-only', async () => {
    stubRoutes({ '/v1/me': meResponse(['role.read', 'role.write']), '/v1/roles': roleList })
    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()
    expect(screen.getByText('Rolle anlegen')).toBeTruthy()
    expect(screen.getByText('Bearbeiten')).toBeTruthy()
    expect(screen.getAllByText('schreibgeschützt')).toHaveLength(2)
  })

  it('shows the session notice when /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderPage()

    expect(await screen.findByText(/Rollenverwaltung benötigt eine gültige Anmeldung/)).toBeTruthy()
  })

  it('shows the forbidden notice without role.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['user.read']) })
    renderPage()

    expect(await screen.findByText('Keine Berechtigung für die Rollenverwaltung.')).toBeTruthy()
  })
})
