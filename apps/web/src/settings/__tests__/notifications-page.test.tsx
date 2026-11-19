import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Deine Kanäle' })).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 2, name: 'Telegram' })).toBeTruthy()

    expect(screen.getAllByText('Noch nicht verknüpft')).toHaveLength(1)
    expect(screen.getAllByText('Kein Konto nötig')).toHaveLength(2)
    expect(screen.getAllByText('Folgt in einem späteren Paket')).toHaveLength(4)

    expect(screen.getByText(/Sende den unten gezeigten Code/)).toBeTruthy()
    expect(await screen.findByText('AB2C3D')).toBeTruthy()

    expect(screen.getByRole('button', { name: 'Telegram-Konto verknüpfen' })).toBeTruthy()
    expect(screen.getByText(/Das Entfernen eines verknüpften Kontos/)).toBeTruthy()
  })

  it('names the channel administration under the header and in the ntfy fallback', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    const administrationLinks = screen.queryAllByRole('link', {
      name: 'Kanal-Administration (Administration → Kanäle)',
    })
    expect(administrationLinks).toHaveLength(2)

    for (const link of administrationLinks) {
      expect(link.getAttribute('href')).toBe('/admin/channels')
    }

    expect(
      await screen.findByText(
        'Die Konfiguration der Kanäle selbst, die schreibgeschützten Geheimnisse und die Testnachricht leben in der Kanal-Administration.'
      )
    ).toBeTruthy()
  })

  it('shows the linked account after the code is submitted', async () => {
    const fetchMock = stubTelegramFlow()
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('AB2C3D')
    fireEvent.click(screen.getByRole('button', { name: 'Telegram-Konto verknüpfen' }))

    expect(
      await screen.findByText('Telegram-Konto verknüpft: Chat-ID 4711')
    ).toBeTruthy()
    expect(
      await screen.findByText(/Name des Chats: Depression Team/)
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

      if (url.endsWith('/v1/notifications/accounts/telegram')) {
        return Response.json({ code: 'invalid_request', params: { fields: ['code'] } }, { status: 422 })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('ZZ9YY8')
    fireEvent.click(screen.getByRole('button', { name: 'Telegram-Konto verknüpfen' }))

    expect(
      await screen.findByText(/Der Code ist ungültig/)
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
    const matrixIdInput = screen.getByLabelText('Matrix-ID', { selector: '#matrix-matrixid' })
    const tokenInput = screen.getByLabelText('Zugangstoken', { selector: '#matrix-token' })
    expect((tokenInput as HTMLInputElement).value).toBe('')

    fireEvent.change(homeserverInput, { target: { value: 'https://matrix.example.org' } })
    fireEvent.change(matrixIdInput, { target: { value: 'alice@example.org' } })
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } })
    expect((tokenInput as HTMLInputElement).value).toBe('secret-token')

    fireEvent.click(screen.getByRole('button', { name: 'Matrix-Konto verknüpfen' }))

    expect(
      await screen.findByText('Matrix-Konto verknüpft: alice@example.org')
    ).toBeTruthy()
    expect(screen.getByText('Der Zugangstoken ist gespeichert.')).toBeTruthy()
    expect((screen.getByLabelText('Zugangstoken', { selector: '#matrix-token' }) as HTMLInputElement).value).toBe('')
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
    fireEvent.change(screen.getByLabelText('Matrix-ID', { selector: '#matrix-matrixid' }), {
      target: { value: 'alice@example.org' },
    })
    fireEvent.change(screen.getByLabelText('Zugangstoken', { selector: '#matrix-token' }), {
      target: { value: 'secret-token' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Matrix-Konto verknüpfen' }))

    expect(
      await screen.findByText(/Der Homeserver hat die ID und den Token zurückgewiesen/)
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
    fireEvent.change(screen.getByLabelText('Matrix-ID', { selector: '#matrix-matrixid' }), {
      target: { value: 'alice@example.org' },
    })
    fireEvent.change(screen.getByLabelText('Zugangstoken', { selector: '#matrix-token' }), {
      target: { value: 'secret-token' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Matrix-Konto verknüpfen' }))
    expect(await screen.findByText('Matrix-Konto verknüpft: alice@example.org')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Matrix-Konto entfernen' }))

    expect(await screen.findByText('Das Matrix-Konto wurde entfernt.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/matrix',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('mounts the ntfy subscription card with the address of the user', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy')) {
        return Response.json({
          publicUrl: 'https://ntfy.sh',
          topic: 'stoerdesk-admin',
          subscriptionUrl: 'https://ntfy.sh/stoerdesk-admin',
          deepLink: 'ntfy://stoerdesk-admin',
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderPage()

    expect(await screen.findByText('In der ntfy-App abonnieren')).toBeTruthy()
    expect(screen.getByText('mit dem Handy scannen')).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelector('svg title')?.textContent).toBe('ntfy-Abo QR-Code')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/ntfy',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('tests the own ntfy topic and shows the result', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy')) {
        return Response.json({
          publicUrl: 'https://ntfy.sh',
          topic: 'stoerdesk-admin',
          subscriptionUrl: 'https://ntfy.sh/stoerdesk-admin',
          deepLink: 'ntfy://stoerdesk-admin',
        })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy/test')) {
        return Response.json({ delivered: true })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('In der ntfy-App abonnieren')
    fireEvent.click(screen.getByRole('button', { name: 'Eigenes Thema testen' }))

    expect(await screen.findByText('Testnachricht an eigenes Thema gesendet.'))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/ntfy/test',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      }),
    )
  })

  it('shows the failure reason when the own ntfy test fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy')) {
        return Response.json({
          publicUrl: 'https://ntfy.sh',
          topic: 'stoerdesk-admin',
          subscriptionUrl: 'https://ntfy.sh/stoerdesk-admin',
          deepLink: 'ntfy://stoerdesk-admin',
        })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy/test')) {
        return Response.json({ delivered: false, code: 'http_401' })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('In der ntfy-App abonnieren')
    fireEvent.click(screen.getByRole('button', { name: 'Eigenes Thema testen' }))

    expect(await screen.findByText(/Anmeldung erforderlich \(401\)/))
  })

  it('keeps the ntfy subscription visible when Telegram is not configured', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'channel_not_configured', params: {} }, { status: 503 })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy')) {
        return Response.json({
          publicUrl: 'https://ntfy.sh',
          topic: 'stoerdesk-admin',
          subscriptionUrl: 'https://ntfy.sh/stoerdesk-admin',
          deepLink: 'ntfy://ntfy.sh/stoerdesk-admin',
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderPage()

    expect(await screen.findByText('In der ntfy-App abonnieren')).toBeTruthy()
    expect(screen.getByText('https://ntfy.sh/stoerdesk-admin')).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(
      await screen.findByText(/nicht konfiguriert|not configured/i),
    ).toBeTruthy()
  })

  it('lists the chats of a connected bridge and connects the chat the user picks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/whatsapp/status')) {
        return Response.json({
          connected: true,
          chats: [{ id: 'chat-1', label: 'Depression Team' }, { id: 'chat-2', label: 'Office Chat' }],
        })
      }

      if (url.endsWith('/v1/notifications/accounts/whatsapp')) {
        if (init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }

        const body = JSON.parse(String(init?.body ?? '{}')) as { chatId?: string }
        const labels: Record<string, string> = { 'chat-1': 'Depression Team', 'chat-2': 'Office Chat' }
        const chatId = body.chatId ?? ''

        if (labels[chatId] !== undefined) {
          return Response.json({
            channel: 'whatsapp',
            externalId: chatId,
            label: labels[chatId],
            secretSet: false,
          })
        }

        return Response.json({ code: 'invalid_request', params: { fields: ['chatId'] } }, { status: 422 })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'WhatsApp Web' })
    expect(await screen.findByText('Office Chat')).toBeTruthy()
    expect(screen.getByText('Depression Team')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Office Chat/ }))

    expect(
      await screen.findByText('WhatsApp Web Konto verknüpft: Chat-ID chat-2')
    ).toBeTruthy()
    expect(screen.getByText('Chat-Name: Office Chat')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/whatsapp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chatId: 'chat-2' }),
      }),
    )
  })

  it('shows the not-connected bridge without any chat and refuses a chat the bridge does not know', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/whatsapp/status')) {
        return Response.json({ connected: false, chats: [] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'WhatsApp Web' })).toBeTruthy()
    expect(await screen.findByText(/Die WhatsApp Web Brücke ist nicht verbunden/)).toBeTruthy()
    expect(screen.queryAllByText('Depression Team')).toHaveLength(0)
  })

  it('removes the connected WhatsApp Web account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/notifications/accounts/whatsapp/status')) {
        return Response.json({
          connected: true,
          chats: [{ id: 'chat-1', label: 'Depression Team' }],
        })
      }

      if (url.endsWith('/v1/notifications/accounts/whatsapp')) {
        if (init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }

        return Response.json({
          channel: 'whatsapp',
          externalId: 'chat-1',
          label: 'Depression Team',
          secretSet: false,
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const connectButton = await screen.findByRole('button', { name: /Depression Team/ })
    fireEvent.click(connectButton)
    expect(await screen.findByText('WhatsApp Web Konto verknüpft: Chat-ID chat-1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp Web Konto entfernen' }))

    expect(await screen.findByText('Das WhatsApp Web Konto wurde entfernt.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/whatsapp',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('reads the selection, marks a configured channel without an account and saves a new one', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
        return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
      }

      if (url.endsWith('/v1/admin/channels')) {
        return Response.json({
          channels: [
            { kind: 'matrix', enabled: true, label: 'Matrix', config: {}, secretSet: false },
            { kind: 'ntfy', enabled: true, label: 'ntfy', config: {}, secretSet: false },
            { kind: 'email', enabled: true, label: 'Email', config: {}, secretSet: false },
          ],
        })
      }

      if (url.endsWith('/v1/notifications/preferences')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { preferences?: unknown }

          return Response.json(body)
        }

        return Response.json({ preferences: [{ eventType: 'ticket.created', channel: 'ntfy' }] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.queryAllByText('Kein Konto verknüpft').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Neuer Vorgang')).toBeTruthy()

    const ntfyCheckbox = container.querySelector('[id="pref-ticket.created:ntfy"]') as HTMLInputElement
    const emailCheckbox = container.querySelector('[id="pref-ticket.created:email"]') as HTMLInputElement
    expect(ntfyCheckbox.checked).toBe(true)
    expect(emailCheckbox.checked).toBe(false)
    expect(emailCheckbox.disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Auswahl speichern' }))

    await screen.findByText('Die Auswahl wurde gespeichert.')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ preferences: [{ eventType: 'ticket.created', channel: 'ntfy' }] }),
      }),
    )
  })
})
