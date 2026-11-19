import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { RoleCreatePage } from '../role-create-page'

const listMarker = 'Rollenliste'

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
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
        <MemoryRouter initialEntries={['/admin/roles/new']}>
          <Routes>
            <Route path="/admin/roles/new" element={<RoleCreatePage />} />
            <Route path="/admin/roles" element={<p>{listMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RoleCreatePage', () => {
  it('shows the form of a new role on its own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['role.read', 'role.write']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Rolle anlegen' })).toBeTruthy()
    expect(screen.getByLabelText('Schlüssel')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rollenverwaltung' })).toBeTruthy()
  })

  it('creates the role and returns to the list of the roles', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json(meResponse(['role.read', 'role.write']))
      }

      if (url.includes('/v1/roles') && init?.method === 'POST') {
        return Response.json({
          id: '22222222-2222-4222-8222-222222222222',
          key: 'office',
          isSystem: false,
          permissionKeys: [],
          userCount: 0,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Schlüssel'), {
      target: { value: 'office' },
    })
    fireEvent.click(screen.getByText('Anlegen'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')

      expect(post).toBeTruthy()
      expect(String(post?.[1]?.body)).toContain('"key":"office"')
    })

    expect(await screen.findByText(listMarker)).toBeTruthy()
  })

  it('shows the forbidden notice without role.write', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/me')) {
          return Response.json(meResponse(['role.read']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()

    expect(await screen.findByText('Keine Berechtigung für die Rollenverwaltung.')).toBeTruthy()
  })
})
