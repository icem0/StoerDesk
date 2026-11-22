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
    const groupId = '77777777-7777-4777-8777-777777777777'

    stubRoutes({
      [`/v1/groups/${groupId}/members`]: {
        members: [
          {
            userId: adminUser.id,
            email: adminUser.email,
            givenName: 'Ada',
            familyName: 'Admin',
          },
        ],
      },
      '/v1/groups': { groups: [{ id: groupId, name: 'Technik', userCount: 1 }] },
      '/v1/me': meResponse(['user.read']),
      '/v1/users': { users: [adminUser] },
    })
    renderPage()

    expect(await screen.findByText('admin@example.com')).toBeTruthy()
    expect(screen.getByText('Benutzerverwaltung')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zurück zu den Einstellungen' })).toBeTruthy()
    expect(screen.getByText('Gruppen')).toBeTruthy()
    expect(await screen.findByText('Technik')).toBeTruthy()
  })

  it('lists the groups of every user sorted by group name', async () => {
    const technikId = '88888888-8888-4888-8888-888888888888'
    const readinessId = '99999999-9999-4999-8999-999999999999'
    const colleague = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'kollege@example.com',
      givenName: 'Kai',
      familyName: 'Kollege',
      locale: 'de',
      theme: 'auto',
      active: true,
      roleKeys: ['oncall'],
    }

    stubRoutes({
      [`/v1/groups/${technikId}/members`]: {
        members: [
          { userId: adminUser.id, email: adminUser.email, givenName: 'Ada', familyName: 'Admin' },
          {
            userId: colleague.id,
            email: colleague.email,
            givenName: colleague.givenName,
            familyName: colleague.familyName,
          },
        ],
      },
      [`/v1/groups/${readinessId}/members`]: {
        members: [
          { userId: adminUser.id, email: adminUser.email, givenName: 'Ada', familyName: 'Admin' },
        ],
      },
      '/v1/groups': {
        groups: [
          { id: technikId, name: 'Technik', userCount: 2 },
          { id: readinessId, name: 'Bereitschaft', userCount: 1 },
        ],
      },
      '/v1/me': meResponse(['user.read']),
      '/v1/users': { users: [adminUser, colleague] },
    })

    renderPage()

    const adminRow = (await screen.findByText('admin@example.com')).closest('tr') as HTMLElement

    expect(await within(adminRow).findByText('Bereitschaft, Technik')).toBeTruthy()

    const colleagueRow = screen.getByText('kollege@example.com').closest('tr') as HTMLElement

    expect(within(colleagueRow).getByText('Technik')).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'Benutzer anlegen' })).toBeTruthy()
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

describe('the one-time password of the administration', () => {
  const colleague = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'kollege@example.com',
    locale: 'de',
    theme: 'auto',
    active: true,
    roleKeys: ['oncall'],
    mustChangePassword: false,
  }

  function stubUserManagement(reset: unknown) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['user.read', 'user.write']))
      }

      if (url.includes('/v1/users') && init?.method === 'POST' && url.includes('/password')) {
        return Response.json(reset)
      }

      if (url.includes('/v1/users')) {
        return Response.json({ users: [adminUser, colleague] })
      }

      if (url.includes('/v1/roles')) {
        return Response.json({ roles: [] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
  }

  it('shows the one-time password after the reset and copies it into the clipboard', async () => {
    const fetchMock = stubUserManagement({ temporaryPassword: 'cPhiW8kWNtdnXzvHHxGS' })
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()

    const row = (await screen.findByText('kollege@example.com')).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText('Neues Passwort'))

    expect(await screen.findByText('cPhiW8kWNtdnXzvHHxGS')).toBeTruthy()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

    expect(String(post?.[0])).toContain(`/v1/users/${colleague.id}/password`)

    fireEvent.click(screen.getByText('In die Zwischenablage kopieren'))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('cPhiW8kWNtdnXzvHHxGS')
    })

    expect(await screen.findByText('Kopiert')).toBeTruthy()
  })

  it('asks before it replaces the password of a colleague', async () => {
    const fetchMock = stubUserManagement({ temporaryPassword: 'cPhiW8kWNtdnXzvHHxGS' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderPage()

    const row = (await screen.findByText('kollege@example.com')).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText('Neues Passwort'))

    expect(confirm).toHaveBeenCalled()
    expect(
      fetchMock.mock.calls.find(([, init]) => init?.method === 'POST'),
    ).toBeUndefined()
    expect(screen.queryByText('cPhiW8kWNtdnXzvHHxGS')).toBeNull()
  })

  it('names the colleagues who still hold a one-time password', async () => {
    stubUserManagement({ temporaryPassword: 'cPhiW8kWNtdnXzvHHxGS' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['user.read', 'user.write']))
        }

        if (url.includes('/v1/users')) {
          return Response.json({
            users: [{ ...colleague, mustChangePassword: true }],
          })
        }

        if (url.includes('/v1/roles')) {
          return Response.json({ roles: [] })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByText('Einmalpasswort aktiv')).toBeTruthy()
  })
})
