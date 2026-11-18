import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { PasswordChangeForm } from '../password-change-form'
import { RequireSession } from '../require-session'

const userId = '11111111-1111-4111-8111-111111111111'

// Marker of the guarded children, kept in a variable because the i18next lint rule
// rejects literal text in JSX (`i18next/no-literal-string`).
const marker = 'guarded-area'

type FetchCall = { url: string; body: string | undefined }

function stubRoutes(routes: Record<string, unknown>, calls: FetchCall[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })

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

  return calls
}

function renderGuarded(routes: Record<string, unknown>, calls: FetchCall[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  stubRoutes(routes, calls)

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

function renderForm(routes: Record<string, unknown>, calls: FetchCall[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  stubRoutes(routes, calls)

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <PasswordChangeForm />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const meWithOpenPasswordChange = {
  user: {
    id: userId,
    email: 'kollege@example.org',
    locale: 'de',
    theme: 'auto',
    roles: ['oncall'],
    permissions: ['ticket.read'],
    mustChangePassword: true,
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the form of the own password', () => {
  it('replaces the page of the app while the flag of the one-time password is set', async () => {
    renderGuarded({ '/v1/me': meWithOpenPasswordChange })

    expect(await screen.findByText('Neues Passwort festlegen')).toBeTruthy()
    expect(screen.getByLabelText('Neues Passwort')).toBeTruthy()
    expect(screen.getByLabelText('Passwort wiederholen')).toBeTruthy()
    expect(screen.queryByText(marker)).toBeNull()
  })

  it('opens the app again for an account without the flag', async () => {
    renderGuarded({
      '/v1/me': {
        user: {
          id: userId,
          email: 'kollege@example.org',
          locale: 'de',
          theme: 'auto',
          roles: ['oncall'],
          permissions: ['ticket.read'],
          mustChangePassword: false,
        },
      },
    })

    expect(await screen.findByText(marker)).toBeTruthy()
    expect(screen.queryByText('Neues Passwort festlegen')).toBeNull()
  })

  it('asks for the repetition before it sends the password', async () => {
    const calls: FetchCall[] = []
    renderForm({ '/v1/users/me': { id: userId } }, calls)

    const password = await screen.findByLabelText('Neues Passwort')
    const repetition = screen.getByLabelText('Passwort wiederholen')

    const { fireEvent } = await import('@testing-library/react')

    fireEvent.change(password, { target: { value: 'a-password-of-my-own' } })
    fireEvent.change(repetition, { target: { value: 'another-password' } })
    fireEvent.click(screen.getByText('Passwort speichern'))

    expect(await screen.findByText('Die beiden Passwörter stimmen nicht überein.')).toBeTruthy()
    expect(calls.filter((call) => call.url.includes('/v1/users/me'))).toHaveLength(0)
  })

  it('sends the own password and names the error of the server', async () => {
    const calls: FetchCall[] = []
    renderForm(
      {
        '/v1/users/me': Response.json(
          { code: 'invalid_request', params: { fields: ['password'] } },
          { status: 400 },
        ),
      },
      calls,
    )

    const { fireEvent } = await import('@testing-library/react')
    const password = await screen.findByLabelText('Neues Passwort')
    const repetition = screen.getByLabelText('Passwort wiederholen')

    fireEvent.change(password, { target: { value: 'a-password-of-my-own' } })
    fireEvent.change(repetition, { target: { value: 'a-password-of-my-own' } })
    fireEvent.click(screen.getByText('Passwort speichern'))

    await waitFor(() => {
      const sent = calls.filter((call) => call.url.includes('/v1/users/me'))

      expect(sent).toHaveLength(1)
      expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual({ password: 'a-password-of-my-own' })
    })

    expect(
      await screen.findByText('Das Passwort ist unvollständig oder zu kurz.'),
    ).toBeTruthy()
  })
})
