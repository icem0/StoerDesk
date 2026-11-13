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
})
