import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { PasswordChangeDialog } from '../password-change-dialog'

const marker = 'dialog-area'

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

function renderDialog(
  open: boolean,
  routes: Record<string, unknown>,
  calls: FetchCall[] = [],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  stubRoutes(routes, calls)

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <div data-testid={marker}>
          <PasswordChangeDialog open={open} onClose={() => undefined} onChange={() => undefined} />
        </div>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the dialog of the own password change', () => {
  it('renders nothing while it is closed', () => {
    renderDialog(false, {})

    expect(screen.queryByTestId(marker)).toBeTruthy()
    expect(screen.queryByText('Passwort ändern')).toBeNull()
    expect(screen.queryByLabelText('Aktuelles Passwort')).toBeNull()
  })

  it('shows the current password, the new one twice and the security criteria', () => {
    renderDialog(true, {})

    expect(screen.getByText('Passwort ändern')).toBeTruthy()
    expect(screen.getByLabelText('Aktuelles Passwort')).toBeTruthy()
    expect(screen.getByLabelText('Neues Passwort')).toBeTruthy()
    expect(screen.getByLabelText('Neues Passwort wiederholen')).toBeTruthy()
    expect(screen.getByText('Mindestens 12 Zeichen')).toBeTruthy()
  })

  it('keeps the submit button disabled until the criteria are met', async () => {
    renderDialog(true, {})

    const submit = screen.getByRole('button', { name: 'Passwort speichern' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    const oldPassword = screen.getByLabelText('Aktuelles Passwort')
    const password = screen.getByLabelText('Neues Passwort')
    const repetition = screen.getByLabelText('Neues Passwort wiederholen')

    const { fireEvent } = await import('@testing-library/react')

    fireEvent.change(oldPassword, { target: { value: 'an-old-password-of-mine' } })
    fireEvent.change(password, { target: { value: 'short' } })
    fireEvent.change(repetition, { target: { value: 'short' } })

    expect(submit.disabled).toBe(true)
    expect(screen.getByText('Das neue Passwort braucht mindestens 12 Zeichen.')).toBeTruthy()

    fireEvent.change(password, { target: { value: 'a-new-password-of-mine' } })
    fireEvent.change(repetition, { target: { value: 'another-password' } })

    expect(submit.disabled).toBe(true)
    expect(screen.getByText('Die beiden neuen Passwörter stimmen nicht überein.')).toBeTruthy()
  })

  it('sends the old and the new password to the server', async () => {
    const calls: FetchCall[] = []
    renderDialog(
      true,
      {
        '/v1/users/me/password': { ok: true },
      },
      calls,
    )

    const oldPassword = screen.getByLabelText('Aktuelles Passwort')
    const password = screen.getByLabelText('Neues Passwort')
    const repetition = screen.getByLabelText('Neues Passwort wiederholen')

    const { fireEvent } = await import('@testing-library/react')

    fireEvent.change(oldPassword, { target: { value: 'an-old-password-of-mine' } })
    fireEvent.change(password, { target: { value: 'a-new-password-of-mine' } })
    fireEvent.change(repetition, { target: { value: 'a-new-password-of-mine' } })
    fireEvent.click(screen.getByText('Passwort speichern'))

    await waitFor(() => {
      const sent = calls.filter((call) => call.url.includes('/v1/users/me/password'))

      expect(sent).toHaveLength(1)
      expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual({
        oldPassword: 'an-old-password-of-mine',
        newPassword: 'a-new-password-of-mine',
      })
    })
  })

  it('shows the server error for a wrong current password', async () => {
    const calls: FetchCall[] = []
    renderDialog(
      true,
      {
        '/v1/users/me/password': Response.json(
          { code: 'password_wrong', params: { fields: ['oldPassword'] } },
          { status: 400 },
        ),
      },
      calls,
    )

    const oldPassword = screen.getByLabelText('Aktuelles Passwort')
    const password = screen.getByLabelText('Neues Passwort')
    const repetition = screen.getByLabelText('Neues Passwort wiederholen')

    const { fireEvent } = await import('@testing-library/react')

    fireEvent.change(oldPassword, { target: { value: 'an-old-password-of-mine' } })
    fireEvent.change(password, { target: { value: 'a-new-password-of-mine' } })
    fireEvent.change(repetition, { target: { value: 'a-new-password-of-mine' } })
    fireEvent.click(screen.getByText('Passwort speichern'))

    await waitFor(() => {
      expect(screen.getByText('Das aktuelle Passwort ist nicht richtig.')).toBeTruthy()
    })

    expect(calls.filter((call) => call.url.includes('/v1/users/me/password'))).toHaveLength(1)
  })
})
