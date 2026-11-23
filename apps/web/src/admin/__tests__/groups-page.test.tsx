import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { GroupsPage } from '../groups-page'

const adminId = '11111111-1111-4111-8111-111111111111'
const groupId = '44444444-4444-4444-8444-444444444444'
const aliceId = '55555555-5555-4555-8555-555555555555'
const bobId = '66666666-6666-4666-8666-666666666666'

const group = { id: groupId, name: 'Technik', userCount: 1 }

const aliceMember = {
  userId: aliceId,
  email: 'alice@example.org',
  givenName: 'Alice',
  familyName: 'Zeta',
}

const aliceUser = {
  id: aliceId,
  email: 'alice@example.org',
  givenName: 'Alice',
  familyName: 'Zeta',
  locale: 'de',
  theme: 'auto',
  active: true,
  roleKeys: [],
  mustChangePassword: false,
}

const bobUser = {
  id: bobId,
  email: 'bob@example.org',
  givenName: 'Bob',
  familyName: 'Alpha',
  locale: 'de',
  theme: 'auto',
  active: true,
  roleKeys: [],
  mustChangePassword: false,
}

function meResponse(permissions: string[]) {
  return {
    user: { id: adminId, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/groups']}>
          <GroupsPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function openMembers() {
  expect(await screen.findByText('Technik')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GroupsPage members', () => {
  it('shows the members, the candidates and the remove button in de', async () => {
    stubRoutes({
      [`/v1/groups/${groupId}/members`]: { members: [aliceMember] },
      '/v1/groups': { groups: [group] },
      '/v1/users': { users: [aliceUser, bobUser] },
      '/v1/me': meResponse(['user.read', 'user.write']),
    })

    renderPage()
    await openMembers()

    expect(await screen.findByText('Alice Zeta')).toBeTruthy()
    expect(screen.getByText('alice@example.org')).toBeTruthy()
    expect(screen.getByText('Mitglieder von Technik')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Bob Alpha' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Alice Zeta' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeTruthy()
  })

  it('adds a selected candidate and removes a member', async () => {
    const calls: { method: string; url: string; body?: { userId?: string } }[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'

        calls.push({
          method,
          url,
          body:
            init?.body === undefined
              ? undefined
              : (JSON.parse(String(init.body)) as { userId?: string }),
        })

        if (method === 'POST') {
          return Response.json({ userId: bobId, groupId }, { status: 201 })
        }

        if (method === 'DELETE') {
          return new Response(null, { status: 204 })
        }

        if (url.includes(`/v1/groups/${groupId}/members`)) {
          return Response.json({ members: [aliceMember] })
        }

        if (url.includes('/v1/groups')) {
          return Response.json({ groups: [group] })
        }

        if (url.includes('/v1/users')) {
          return Response.json({ users: [aliceUser, bobUser] })
        }

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['user.read', 'user.write']))
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage()
    await openMembers()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Bob Alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST' && call.body?.userId === bobId)).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === 'DELETE' &&
            call.url.includes(`/v1/groups/${groupId}/members/${aliceId}`),
        ),
      ).toBe(true)
    })
  })
})
