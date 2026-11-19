import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { UserCreatePage } from '../user-create-page'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  locale: 'de',
  theme: 'auto',
  active: true,
  roleKeys: ['admin'],
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

const listMarker = 'Benutzerliste'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/users/new']}>
          <Routes>
            <Route path="/admin/users/new" element={<UserCreatePage />} />
            <Route path="/admin/users" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UserCreatePage', () => {
  it('shows the form of a new user on its own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['user.read', 'user.write']))
        }

        if (url.includes('/v1/roles')) {
          return Response.json({
            roles: [
              { id: adminUser.id, key: 'admin', isSystem: true, permissionKeys: [], userCount: 1 },
            ],
          })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Benutzer anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('E-Mail')).toBeTruthy()
    expect(screen.getByLabelText('Passwort')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Benutzerverwaltung' })).toBeTruthy()
  })

  it('creates the user and returns to the list of the users', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['user.read', 'user.write']))
      }

      if (url.includes('/v1/roles')) {
        return Response.json({ roles: [] })
      }

      if (url.includes('/v1/users') && init?.method === 'POST') {
        return Response.json({ ...adminUser, email: 'neu@example.com' })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('E-Mail'), {
      target: { value: 'neu@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Passwort'), {
      target: { value: 'ein-langes-passwort' },
    })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"email":"neu@example.com"')
    })

    expect(await screen.findByText('Benutzerliste')).toBeTruthy()
  })

  it('shows the forbidden notice without user.write', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['user.read']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(
      await screen.findByText('Keine Berechtigung für die Benutzerverwaltung.'),
    ).toBeTruthy()
  })
})
