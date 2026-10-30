import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { UsersPage } from '../users-page'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  locale: 'de',
  active: true,
  roleKeys: ['admin'],
}

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
    user: {
      id: adminUser.id,
      email: adminUser.email,
      locale: 'de',
      roles: ['admin'],
      permissions,
    },
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <UsersPage />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UsersPage', () => {
  it('renders the user table for a session with user.read', async () => {
    stubRoutes({
      '/v1/me': meResponse(['user.read']),
      '/v1/users': { users: [adminUser] },
    })
    renderPage()

    expect(await screen.findByText('admin@example.com')).toBeTruthy()
    expect(screen.getByText('Benutzerverwaltung')).toBeTruthy()
  })

  it('offers create and edit controls only with user.write', async () => {
    stubRoutes({
      '/v1/me': meResponse(['user.read', 'user.write']),
      '/v1/users': { users: [adminUser] },
      '/v1/roles': {
        roles: [
          { id: adminUser.id, key: 'admin', isSystem: true, permissionKeys: [], userCount: 1 },
        ],
      },
    })
    renderPage()

    expect(await screen.findByText('admin@example.com')).toBeTruthy()
    expect(screen.getByText('Bearbeiten')).toBeTruthy()
    expect(screen.getByText('Benutzer anlegen')).toBeTruthy()
  })

  it('shows the session notice when /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderPage()

    expect(await screen.findByText(/gültige Anmeldung/)).toBeTruthy()
  })

  it('shows the forbidden notice without user.read', async () => {
    stubRoutes({
      '/v1/me': meResponse(['role.read']),
    })
    renderPage()

    expect(await screen.findByText('Keine Berechtigung für die Benutzerverwaltung.')).toBeTruthy()
  })
})
