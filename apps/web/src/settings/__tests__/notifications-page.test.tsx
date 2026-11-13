import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { NotificationsPage } from '../notifications-page'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/settings/notifications']}>
          <Routes>
            <Route path="/settings/notifications" element={<NotificationsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubTelegramFlow() {
  return vi.fn(async (input: RequestInfo | URL, options?: { body?: string }) => {
    const url = String(input)

    if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
      return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
    }

    if (url.endsWith('/v1/notifications/accounts/telegram')) {
      const body = JSON.parse(options?.body ?? '{}') as { code?: string }

      if (body.code === 'AB2C3D') {
        return Response.json({
          channel: 'telegram',
          externalId: '4711',
          label: 'Depression Team',
          secretSet: false,
        })
      }

      return Response.json({ code: 'invalid_request', params: { fields: ['code'] } }, { status: 422 })
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationsPage', () => {
  it('lists the channels with their state and renders the Telegram section with the code', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Your channels' })).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 2, name: 'Telegram' })).toBeTruthy()

    expect(screen.getAllByText('Not connected yet')).toHaveLength(1)
    expect(screen.getAllByText('No account needed')).toHaveLength(2)
    expect(screen.getAllByText('Follows in a later package')).toHaveLength(4)

    expect(screen.getByText(/Please send the code|Send the code/i)).toBeTruthy()
    expect(await screen.findByText('AB2C3D')).toBeTruthy()

    expect(screen.getByRole('button', { name: 'Connect the Telegram account' })).toBeTruthy()
    expect(screen.getByText(/Removing a connected account/i)).toBeTruthy()
  })

  it('shows the linked account after the code is submitted', async () => {
    const fetchMock = stubTelegramFlow()
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('AB2C3D')
    fireEvent.click(screen.getByRole('button', { name: 'Connect the Telegram account' }))

    expect(
      await screen.findByText('Telegram account connected: Chat id 4711')
    ).toBeTruthy()
    expect(
      await screen.findByText(/(Name of the chat|Chat name): Depression Team/)
    ).toBeTruthy()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/telegram',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'AB2C3D' }),
      }),
    )
  })

  it('shows the error of the API as inline text when the code is refused', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'ZZ9YY8', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      return Response.json({ code: 'invalid_request', params: { fields: ['code'] } }, { status: 422 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('ZZ9YY8')
    fireEvent.click(screen.getByRole('button', { name: 'Connect the Telegram account' }))

    expect(
      await screen.findByText(/The code is invalid/i)
    ).toBeTruthy()
  })

  it('stores a valid Matrix account and clears the token field after the save', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/matrix')) {
        if (init?.method === 'DELETE') {
          return Response.json({ code: 'account_not_found', params: { fields: ['channel'] } }, { status: 404 })
        }

        return Response.json({
          channel: 'matrix',
          externalId: 'alice@example.org',
          label: '',
          secretSet: true,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const homeserverInput = await screen.findByLabelText('Homeserver', {
      selector: '#matrix-homeserver',
    })
    const matrixIdInput = screen.getByLabelText('Matrix id', { selector: '#matrix-matrixid' })
    const tokenInput = screen.getByLabelText('Access token', { selector: '#matrix-token' })
    expect((tokenInput as HTMLInputElement).value).toBe('')

    fireEvent.change(homeserverInput, { target: { value: 'https://matrix.example.org' } })
    fireEvent.change(matrixIdInput, { target: { value: 'alice@example.org' } })
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } })
    expect((tokenInput as HTMLInputElement).value).toBe('secret-token')

    fireEvent.click(screen.getByRole('button', { name: 'Connect the Matrix account' }))

    expect(
      await screen.findByText('Matrix account connected: alice@example.org')
    ).toBeTruthy()
    expect(screen.getByText('The access token is stored.')).toBeTruthy()
    expect((screen.getByLabelText('Access token', { selector: '#matrix-token' }) as HTMLInputElement).value).toBe('')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/matrix',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          homeserver: 'https://matrix.example.org',
          matrixId: 'alice@example.org',
          accessToken: 'secret-token',
        }),
      }),
    )
  })

  it('shows the error of the API as inline text when the homeserver refuses the pair', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/matrix')) {
        if (init?.method === 'DELETE') {
          return Response.json({ code: 'account_not_found', params: { fields: ['channel'] } }, { status: 404 })
        }

        return Response.json({ code: 'invalid_request', params: { fields: ['homeserver'] } }, { status: 422 })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(screen.getByLabelText('Homeserver', { selector: '#matrix-homeserver' }), {
      target: { value: 'https://matrix.example.org' },
    })
    fireEvent.change(screen.getByLabelText('Matrix id', { selector: '#matrix-matrixid' }), {
      target: { value: 'alice@example.org' },
    })
    fireEvent.change(screen.getByLabelText('Access token', { selector: '#matrix-token' }), {
      target: { value: 'secret-token' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connect the Matrix account' }))

    expect(
      await screen.findByText(/The homeserver refused the id and the token/i)
    ).toBeTruthy()
  })

  it('removes the connected Matrix account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/matrix')) {
        if (init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }

        return Response.json({
          channel: 'matrix',
          externalId: 'alice@example.org',
          label: '',
          secretSet: true,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(screen.getByLabelText('Homeserver', { selector: '#matrix-homeserver' }), {
      target: { value: 'https://matrix.example.org' },
    })
    fireEvent.change(screen.getByLabelText('Matrix id', { selector: '#matrix-matrixid' }), {
      target: { value: 'alice@example.org' },
    })
    fireEvent.change(screen.getByLabelText('Access token', { selector: '#matrix-token' }), {
      target: { value: 'secret-token' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connect the Matrix account' }))
    expect(await screen.findByText('Matrix account connected: alice@example.org')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove the Matrix account' }))

    expect(await screen.findByText('The Matrix account was removed.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/matrix',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
