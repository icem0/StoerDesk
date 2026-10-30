import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { RequireSession } from '../require-session'

const adminId = '11111111-1111-4111-8111-111111111111'

// Marker of the guarded children, kept in a variable because the i18next lint rule
// rejects literal text in JSX (`i18next/no-literal-string`).
const marker = 'guarded-area'

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          if (payload instanceof Response || payload instanceof Promise) {
            return payload
          }

          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RequireSession>
          <p>{marker}</p>
        </RequireSession>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequireSession', () => {
  it('shows the loading text while /me is pending', () => {
    stubRoutes({ '/v1/me': new Promise<Response>(() => undefined) })
    renderGuarded()

    expect(screen.getByText('Lädt …')).toBeTruthy()
    expect(screen.queryByText(marker)).toBeNull()
  })

  it('renders the login form while /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderGuarded()

    expect(await screen.findByText('Anmeldung')).toBeTruthy()
    expect(screen.getByLabelText('E-Mail')).toBeTruthy()
    expect(screen.queryByText(marker)).toBeNull()
  })

  it('renders the guarded children for a valid session', async () => {
    stubRoutes({
      '/v1/me': {
        user: {
          id: adminId,
          email: 'admin@example.com',
          locale: 'de',
          roles: ['admin'],
          permissions: ['user.read'],
        },
      },
    })
    renderGuarded()

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(screen.queryByLabelText('Passwort')).toBeNull()
  })
})
