import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

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
        <MemoryRouter initialEntries={['/admin/roles']}>
          <RolesPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function rowOf(key: string) {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryAllByRole('cell')[0]?.textContent === key)

  if (row === undefined) {
    throw new Error(`no row for the role ${key}`)
  }

  return row
}

function openEditor(key: string) {
  fireEvent.click(within(rowOf(key)).getByRole('button', { name: 'Bearbeiten' }))
}

function editorOf(key: string) {
  const heading = screen.getByText(`Rolle ${key} bearbeiten`)
  const form = heading.closest('form')

  if (form === null) {
    throw new Error(`no editor form for the role ${key}`)
  }

  return form
}

function checkboxOf(roleKey: string, permissionKey: string) {
  return within(editorOf(roleKey)).getByRole('checkbox', { name: permissionKey }) as HTMLInputElement
}

describe('RolesPage', () => {
  it('renders the role table for a session with role.read', async () => {
    stubRoutes({ '/v1/me': meResponse(['role.read']), '/v1/roles': roleList })
    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()
    expect(screen.getByText('Rollenverwaltung')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zurück zu den Einstellungen' })).toBeTruthy()
    expect(screen.getByText('office')).toBeTruthy()
    expect(screen.queryByText('Rolle anlegen')).toBeNull()
  })

  it('offers create and edit controls with role.write; only admin stays read-only', async () => {
    stubRoutes({ '/v1/me': meResponse(['role.read', 'role.write']), '/v1/roles': roleList })
    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rolle anlegen' })).toBeTruthy()
    expect(screen.getAllByText('Bearbeiten')).toHaveLength(2)
    expect(screen.getAllByText('schreibgeschützt')).toHaveLength(1)
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

  it('shows the permissions of the selected role, not of the role before it', async () => {
    stubRoutes({ '/v1/me': meResponse(['role.read', 'role.write']), '/v1/roles': roleList })
    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()

    openEditor('office')
    expect(checkboxOf('office', 'ticket.read').checked).toBe(false)
    expect(checkboxOf('office', 'ticket.review').checked).toBe(false)

    openEditor('dispatcher')
    expect(checkboxOf('dispatcher', 'ticket.read').checked).toBe(true)
    expect(checkboxOf('dispatcher', 'ticket.review').checked).toBe(false)
  })

  it('saves the permissions of the selected role only', async () => {
    const patches: { url: string; body: unknown }[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (init?.method === 'PATCH') {
          patches.push({ url, body: JSON.parse(String(init.body)) })

          return Response.json({
            id: '33333333-3333-4333-8333-333333333333',
            key: 'dispatcher',
            isSystem: false,
            permissionKeys: [],
            userCount: 0,
          })
        }

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['role.read', 'role.write']))
        }

        if (url.includes('/v1/roles')) {
          return Response.json(roleList)
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByText('dispatcher')).toBeTruthy()

    openEditor('office')
    fireEvent.click(checkboxOf('office', 'ticket.review'))

    openEditor('dispatcher')
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => {
      expect(patches).toHaveLength(1)
    })

    expect(patches[0]?.url).toContain('/v1/roles/dispatcher')
    expect(patches[0]?.body).toEqual({ permissionKeys: ['ticket.read'] })
  })
})
