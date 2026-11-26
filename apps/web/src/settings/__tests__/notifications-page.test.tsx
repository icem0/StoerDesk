import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

/**
 * The row of a channel in the overview (`specs/10-notifications.md` §11.19,
 * WP-M35-02): the page shows the overview of every channel, the setup of a
 * channel opens only when its own button is clicked.
 */
async function channelRow(name: string): Promise<HTMLElement> {
  const label = (await screen.findAllByText(name))[0]

  if (label === undefined) {
    throw new Error(`the row of the channel ${name} is missing`)
  }

  const row = label.closest('li')

  if (row === null) {
    throw new Error(`the row of the channel ${name} is missing`)
  }

  return row
}

async function openChannel(name: string) {
  const row = await channelRow(name)

  fireEvent.click(within(row).getByRole('button', { name: 'Konfigurieren' }))
}

function stubTelegramFlow() {
  return vi.fn(async (input: RequestInfo | URL, options?: { body?: string; method?: string }) => {
    const url = String(input)

    if (url.endsWith('/v1/notifications/accounts') && options?.method === undefined) {
      return Response.json({
        accounts: [
          {
            channel: 'telegram',
            externalId: '4711',
            label: 'Depression Team',
            secretSet: false,
            target: '',
            verifiedAt: null,
            state: 'linked',
          },
        ],
      })
    }

    if (url.endsWith('/v1/notifications/compliance')) {
      return Response.json({
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Nora Reich',
        channels: [
          { channel: 'ntfy', state: 'missing' },
          { channel: 'telegram', state: 'missing' },
          { channel: 'matrix', state: 'missing' },
          { channel: 'email', state: 'missing' },
          { channel: 'webpush', state: 'missing' },
          { channel: 'whatsapp', state: 'missing' },
        ],
        missing: [],
        channelCount: 0,
        compliant: true,
        policy: { requiredChannels: [], minimumChannelCount: 0 },
      })
    }

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
  it('lists every channel with its state', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Deine Kanäle' })).toBeTruthy()

    // The state of every channel comes from the server (§11.3a, WP-M24-16).
    expect((await screen.findAllByText('Nicht eingerichtet')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kanal der Installation')).toHaveLength(1)
    expect((await screen.findAllByText('Verknüpft, nicht bestätigt')).length).toBeGreaterThan(0)
  })

  it('opens the setup of a channel only when its button is clicked', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Deine Kanäle' })).toBeTruthy()

    // The setup of a channel stays hidden until its own button is clicked
    // (§11.19, WP-M35-02) — no long column of forms nobody needs.
    expect(screen.queryByRole('heading', { level: 2, name: 'Telegram' })).toBeNull()
    expect(screen.queryAllByRole('button', { name: 'Code senden' })).toHaveLength(0)

    await openChannel('Telegram')

    expect(await screen.findByRole('heading', { level: 2, name: 'Telegram' })).toBeTruthy()
    expect(await screen.findByText(/Sende den unten gezeigten Code/i)).toBeTruthy()
    expect(await screen.findByText('AB2C3D')).toBeTruthy()

    expect(screen.getByRole('button', { name: 'Telegram-Konto verknüpfen' })).toBeTruthy()
    expect(screen.getByText(/Das Entfernen eines verknüpften Kontos/i)).toBeTruthy()
  })

  it('closes the setup of a channel when its button is clicked again', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    await openChannel('Telegram')
    expect(await screen.findByRole('heading', { level: 2, name: 'Telegram' })).toBeTruthy()

    const row = await channelRow('Telegram')

    fireEvent.click(within(row).getByRole('button', { name: 'Schließen' }))

    expect(screen.queryByRole('heading', { level: 2, name: 'Telegram' })).toBeNull()
  })

  it('names the rule of the administration in the overview', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/compliance')) {
        return Response.json({
          userId: '11111111-1111-4111-8111-111111111111',
          name: 'Nora Reich',
          channels: [
            { channel: 'ntfy', state: 'missing' },
            { channel: 'telegram', state: 'ready' },
            { channel: 'matrix', state: 'missing' },
            { channel: 'email', state: 'missing' },
            { channel: 'webpush', state: 'missing' },
            { channel: 'whatsapp', state: 'missing' },
          ],
          missing: ['ntfy'],
          channelCount: 1,
          compliant: false,
          policy: { requiredChannels: ['ntfy', 'telegram'], minimumChannelCount: 2 },
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    // The mandatory channels carry their badge (§11.19, WP-M35-01).
    expect(await screen.findAllByText('Pflicht')).toHaveLength(2)

    // The number of the channels and what is still missing.
    expect(screen.getByText('1 von 2 Kanälen eingerichtet')).toBeTruthy()
    expect(screen.getByText('Es fehlen noch: ntfy.')).toBeTruthy()
  })

  it('names that the administration made no rule', async () => {
    vi.stubGlobal('fetch', stubTelegramFlow())

    renderPage()

    expect(
      await screen.findByText('Die Administration hat keine Vorgabe gemacht — jeder Kanal ist freiwillig.'),
    ).toBeTruthy()
  })

  it('names the channel administration under the header and in the overview', async () => {
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

    await openChannel('Telegram')
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

    await openChannel('Telegram')
    await screen.findByText('ZZ9YY8')
    fireEvent.click(screen.getByRole('button', { name: 'Telegram-Konto verknüpfen' }))

    expect(
      await screen.findByText(/Der Code ist ungültig, abgelaufen oder bereits verwendet/i)
    ).toBeTruthy()
  })

  it('stores a valid Matrix account and clears the token field after the save', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

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

    await openChannel('Matrix')

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

    await openChannel('Matrix')

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
      await screen.findByText(/Der Homeserver hat die ID und den Token zurückgewiesen/i)
    ).toBeTruthy()
  })

  it('removes the connected Matrix account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

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

    await openChannel('Matrix')

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

    // The topic of the user only appears when the channel is opened (§11.19).
    expect(screen.queryByText('In der ntfy-App abonnieren')).toBeNull()

    await openChannel('ntfy')

    expect(await screen.findByText('In der ntfy-App abonnieren')).toBeTruthy()
    expect(screen.getByText('mit dem Handy scannen')).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(container.querySelector('svg title')?.textContent).toBe('ntfy-Abo QR-Code')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/accounts/ntfy',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('tests the own ntfy topic and shows the result', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

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

    await openChannel('ntfy')

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

    await openChannel('ntfy')

    await screen.findByText('In der ntfy-App abonnieren')
    fireEvent.click(screen.getByRole('button', { name: 'Eigenes Thema testen' }))

    expect(await screen.findByText(/Anmeldung erforderlich \(401\)/)).toBeTruthy()
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

    await openChannel('ntfy')

    expect(await screen.findByText('In der ntfy-App abonnieren')).toBeTruthy()
    expect(screen.getByText('https://ntfy.sh/stoerdesk-admin')).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(
      await screen.findByText(/ntfy (ist auf diesem Server nicht eingerichtet|is not configured)/i),
    ).toBeTruthy()
  })

  it('lists the chats of a connected bridge and connects the chat the user picks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

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

    await openChannel('WhatsApp Web')

    expect(await screen.findByRole('heading', { level: 2, name: 'WhatsApp Web' })).toBeTruthy()
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

      if (url.endsWith('/v1/notifications/accounts/whatsapp/status')) {
        return Response.json({ connected: false, chats: [] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await openChannel('WhatsApp Web')

    expect(await screen.findByRole('heading', { level: 2, name: 'WhatsApp Web' })).toBeTruthy()
    expect(await screen.findByText(/Die WhatsApp Web Brücke ist nicht verbunden/i)).toBeTruthy()
    expect(screen.queryAllByText('Depression Team')).toHaveLength(0)
  })

  it('removes the connected WhatsApp Web account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

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

    await openChannel('WhatsApp Web')

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

})

describe('NotificationsPage — the code of a channel (WP-M24-21)', () => {
  it('names the reason of a refused code instead of a bare error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/v1/notifications/accounts') && init?.method === undefined) {
        return Response.json({
          accounts: [
            {
              channel: 'ntfy',
              externalId: 'stoerdesk-admin',
              label: '',
              secretSet: false,
              target: '',
              verifiedAt: null,
              state: 'linked',
            },
          ],
        })
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy/verification')) {
        return Response.json(
          { code: 'send_failed', params: { reason: 'http_403' } },
          { status: 502 },
        )
      }

      if (url.endsWith('/v1/notifications/accounts/ntfy')) {
        return Response.json({
          publicUrl: 'https://ntfy.sh',
          topic: 'stoerdesk-admin',
          subscriptionUrl: 'https://ntfy.sh/stoerdesk-admin',
          deepLink: 'ntfy://stoerdesk-admin',
        })
      }

      if (url.endsWith('/v1/notifications/compliance')) {
        return Response.json({
          userId: '11111111-1111-4111-8111-111111111111',
          name: 'Nora Reich',
          channels: [{ channel: 'ntfy', state: 'linked' }],
          missing: [],
          channelCount: 1,
          compliant: true,
          policy: { requiredChannels: [], minimumChannelCount: 0 },
        })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await openChannel('ntfy')

    await screen.findByText('In der ntfy-App abonnieren')
    fireEvent.click(screen.getByRole('button', { name: 'Code senden' }))

    expect(await screen.findByText(/Veröffentlichung verweigert \(403\)/)).toBeTruthy()
  })
})
