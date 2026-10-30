import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { LoginForm, LogoutButton } from '../login-form'
import { RequireSession } from '../require-session'

const adminId = '11111111-1111-4111-8111-111111111111'

// Marker of the guarded children, kept in a variable because the i18next lint rule
// rejects literal text in JSX (`i18next/no-literal-string`).
const marker = 'guarded-area'

/**
 * A path may map to a single payload or to an ordered list of payloads, so a later call
 * (for example the `/me` refetch after a logout) can answer differently.
 */
function stubRoutes(routes: Record<string, unknown>) {
  const calls = new Map<string, number>()

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      for (const [path, payload] of Object.entries(routes)) {
        if (!url.includes(path)) {
          continue
        }

        const index = calls.get(path) ?? 0
        calls.set(path, index + 1)
        const entries = Array.isArray(payload) ? payload : [payload]
        const entry = entries[Math.min(index, entries.length - 1)]

        return entry instanceof Response ? entry : Response.json(entry)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function meResponse() {
  return {
    user: {
      id: adminId,
      email: 'admin@example.com',
      locale: 'de',
      roles: ['admin'],
      permissions: [],
    },
  }
}

const unauthorized = () => Response.json({ code: 'session_invalid', params: {} }, { status: 401 })

function renderWithProviders(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{element}</I18nextProvider>
    </QueryClientProvider>,
  )
}

function submitLoginForm(email = 'admin@example.com', password = 'seed-admin-password') {
  fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginForm', () => {
  it('shows the shared credentials notice for a 401 invalid_credentials', async () => {
    stubRoutes({
      '/v1/auth/login': Response.json({ code: 'invalid_credentials', params: {} }, { status: 401 }),
    })
    renderWithProviders(<LoginForm />)
    submitLoginForm()

    expect(
      await screen.findByText('Anmeldung fehlgeschlagen. E-Mail oder Passwort ist falsch.'),
    ).toBeTruthy()
  })

  it('shows the rate-limit notice for a 429', async () => {
    stubRoutes({
      '/v1/auth/login': Response.json({ code: 'rate_limited', params: {} }, { status: 429 }),
    })
    renderWithProviders(<LoginForm />)
    submitLoginForm()

    expect(
      await screen.findByText('Zu viele Anmeldeversuche. Bitte in einer Minute erneut versuchen.'),
    ).toBeTruthy()
  })

  it('swaps the form for the guarded content after a successful login', async () => {
    stubRoutes({
      '/v1/me': [unauthorized(), meResponse()],
      '/v1/auth/login': meResponse(),
    })
    renderWithProviders(
      <RequireSession>
        <p>{marker}</p>
      </RequireSession>,
    )

    expect(await screen.findByLabelText('Passwort')).toBeTruthy()
    submitLoginForm()

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(screen.queryByLabelText('Passwort')).toBeNull()
  })

  it('drops the session and shows the form again when the logout button is clicked', async () => {
    stubRoutes({
      '/v1/me': [meResponse(), unauthorized()],
      '/v1/auth/logout': new Response(null, { status: 204 }),
    })
    renderWithProviders(
      <RequireSession>
        <p>{marker}</p>
        <LogoutButton />
      </RequireSession>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Abmelden' }))

    expect(await screen.findByLabelText('E-Mail')).toBeTruthy()
    expect(screen.queryByText(marker)).toBeNull()
  })
})
