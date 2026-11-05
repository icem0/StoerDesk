import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { UsersPage } from '../users-page'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  locale: 'de',
  theme: 'auto',
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
      theme: 'auto',
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
        <MemoryRouter initialEntries={['/admin/users']}>
          <UsersPage />
        </MemoryRouter>
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
    expect(screen.getByRole('link', { name: 'Zurück zur Verwaltung' })).toBeTruthy()
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

  it('offers the theme of a user in the edit form and sends it with the PATCH', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['user.read', 'user.write']))
      }

      if (url.includes('/v1/users') && init?.method === 'PATCH') {
        return Response.json({ ...adminUser, theme: 'light' })
      }

      if (url.includes('/v1/users')) {
        return Response.json({ users: [adminUser] })
      }

      if (url.includes('/v1/roles')) {
        return Response.json({ roles: [] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(await screen.findByText('Bearbeiten'))

    const editForm = (await screen.findByText('Benutzer bearbeiten')).closest('form')
    const select = within(editForm as HTMLElement).getByLabelText('Design') as HTMLSelectElement
    expect(select.value).toBe('auto')

    fireEvent.change(select, { target: { value: 'light' } })
    fireEvent.click(screen.getByText('Speichern'))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')

      expect(patch).toBeTruthy()
      expect(String(patch?.[1]?.body)).toContain('"theme":"light"')
    })
  })
})
