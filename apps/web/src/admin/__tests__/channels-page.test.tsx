import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { ChannelsPage } from '../channels-page'

const matrix = {
  kind: 'matrix',
  enabled: true,
  label: 'Matrix',
  config: { homeserver: 'https://matrix.example.org', roomId: '!room:example.org' },
  secretSet: true,
  verified: true,
}

const ntfy = {
  kind: 'ntfy',
  enabled: false,
  label: 'ntfy',
  config: { url: 'https://ntfy.example.org', topic: 'stoerdesk' },
  secretSet: false,
  verified: false,
}

const webpush = {
  kind: 'webpush',
  enabled: true,
  label: 'Web Push',
  config: { publicKey: 'BLg2publickey', subject: 'mailto:admin@example.org' },
  secretSet: true,
  verified: true,
}

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      roles: ['admin'],
      permissions,
    },
  }
}

function stub(routes: {
  me: unknown
  channels?: unknown
  test?: unknown
  testError?: { status: number; code: string }
  verification?: unknown
  confirm?: unknown
  status?: unknown
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) return Response.json(routes.me)
      if (url.includes('/verification/confirm')) {
        return Response.json(routes.confirm ?? { verified: true })
      }
      if (url.includes('/verification')) {
        return Response.json(
          routes.verification ?? { expiresAt: new Date(Date.now() + 600_000).toISOString() },
        )
      }
      if (url.includes('/v1/admin/channels/') && url.includes('/test')) {
        if (routes.testError !== undefined) {
          return Response.json(
            { code: routes.testError.code, params: {} },
            { status: routes.testError.status },
          )
        }
        return Response.json(routes.test ?? { delivered: true })
      }
      if (url.includes('/v1/admin/channels')) {
        if (init?.method === 'PATCH') return Response.json(matrix)
        return Response.json(routes.channels ?? { channels: [matrix, ntfy] })
      }
      if (url.includes('/v1/notifications/status')) {
        return Response.json(routes.status ?? { channels: [] })
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
        <MemoryRouter initialEntries={['/admin/channels']}>
          <ChannelsPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChannelsPage', () => {
  it('renders the channels of the API with their state and public configuration', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    expect(await screen.findByDisplayValue('!room:example.org')).toBeTruthy()
    expect(screen.getByDisplayValue('https://matrix.example.org')).toBeTruthy()
    expect(screen.getByDisplayValue('https://ntfy.example.org')).toBeTruthy()
    expect(screen.getByText('Ein Geheimnis ist gespeichert.')).toBeTruthy()
    expect(screen.getByText(/Zustand: deaktiviert/)).toBeTruthy()
  })

  it('keeps the secret field empty and sends the typed secret only on save', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    const secret = (await screen.findByLabelText('Geheimnis (nur schreiben)', {
      selector: '#matrix-secret',
    })) as HTMLInputElement
    expect(secret.value).toBe('')

    fireEvent.change(secret, { target: { value: 'super-secret' } })
    expect(secret.value).toBe('super-secret')

    fireEvent.click(screen.getAllByText('Speichern')[0] as HTMLElement)

    expect(await screen.findByText('Gespeichert.')).toBeTruthy()
    expect(secret.value).toBe('')
  })

  it('sends a test message and reports the delivered result', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: true },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText('Testnachricht gesendet.')).toBeTruthy()

    const fetchMock = vi.mocked(fetch)
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/test') && init?.method === 'POST' && init?.body === '{}',
        ),
      ).toBe(true)
    })
  })

  it('names the status and the code of a rejected test request instead of a raw key', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      testError: { status: 400, code: 'FST_ERR_CTP_EMPTY_JSON_BODY' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText(/HTTP 400, Code FST_ERR_CTP_EMPTY_JSON_BODY/)).toBeTruthy()
    expect(screen.queryByText(/admin\.channels\.errors\./)).toBeNull()
  })

  it('shows no failing-channel list while the outbox has no failed rows', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      status: {
        channels: [
          {
            name: 'ntfy',
            lastSentAt: '2026-11-13T08:00:00.000Z',
            lastFailedAt: null,
            pending: 0,
            failed: 0,
          },
        ],
      },
    })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { level: 2, name: /^Zust/ })).toBeNull()
    expect(screen.queryByText(/^3 \w+/)).toBeNull()
  })

  it('lists the failing channels with their last failure and the failed rows', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      status: {
        channels: [
          {
            name: 'signal',
            lastSentAt: '2026-11-13T08:00:00.000Z',
            lastFailedAt: '2026-11-13T09:30:00.000Z',
            pending: 0,
            failed: 3,
          },
          {
            name: 'matrix',
            lastSentAt: null,
            lastFailedAt: '2026-11-12T10:00:00.000Z',
            pending: 1,
            failed: 1,
          },
        ],
      },
    })
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: /^Zust/ })).toBeTruthy()
    expect(screen.getByText(/^Signal$/)).toBeTruthy()
    expect(screen.getAllByText(/^at /)).toHaveLength(2)
    expect(screen.getByText(/^3 \w+/)).toBeTruthy()
  })

  it('shows the translated lastError next to a failing channel', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      status: {
        channels: [
          {
            name: 'ntfy',
            lastSentAt: null,
            lastFailedAt: '2026-11-13T10:00:00.000Z',
            pending: 0,
            failed: 1,
            lastError: 'http_407',
          },
        ],
      },
    })
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: /^Zust/ })).toBeTruthy()
    expect(await screen.findByText(/bereits vergeben \(407\)/)).toBeTruthy()
  })

  it('marks a failed test send as failed and shows its code', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: false, code: 'send_failed' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(
      await screen.findByText('Testnachricht fehlgeschlagen: Der Versand ist fehlgeschlagen.'),
    ).toBeTruthy()
    expect(screen.getByText(/Zustand: fehlgeschlagen/)).toBeTruthy()
  })

  it('explains an ntfy test send failure with the server answer', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: false, code: 'http_407' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText(/bereits vergeben \(407\)/)).toBeTruthy()
  })

  it('explains an unknown ntfy error code generically', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: false, code: 'http_999' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText(/http_999/)).toBeTruthy()
  })

  it('names the cause of a failing web push test send (WP-M15-08)', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      channels: { channels: [webpush] },
      test: { delivered: false, code: 'push_unreachable' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText(/did not answer: the connection failed/)).toBeTruthy()
    expect(screen.queryByText(/ntfy-Server hat den Code/)).toBeNull()
  })

  it('names the access token when the publication is refused (WP-M14-52)', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: false, code: 'http_401' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText(/Zugriffstoken dieses Kanals fehlt/)).toBeTruthy()
  })

  it('warns on the ntfy card while the channel has no key (WP-M14-52)', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      channels: { channels: [matrix, { ...ntfy, enabled: true }] },
    })
    renderPage()

    expect(await screen.findByText(/needs its access token in the secret field/)).toBeTruthy()
  })

  it('carries the access token as a shell variable in the copied curl (WP-M14-52)', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      channels: {
        channels: [matrix, { ...ntfy, enabled: true, verified: true, secretSet: true }],
      },
    })
    renderPage()

    const curl = await screen.findByDisplayValue(/^curl -X POST/)
    const command = String(curl.textContent ?? curl.getAttribute('value'))
    expect(command).toContain('-H "Authorization: Bearer $NTFY_TOKEN"')
    expect(command.includes('Bearer tk_')).toBe(false)
    const lines = command.split('\n')
    expect(lines.slice(0, -1).every((line) => line.endsWith(' \\'))).toBe(true)
    expect(lines.at(-1)?.startsWith('  -d ')).toBe(true)
  })

  it('keeps ntfy unverified until the code from the topic was confirmed', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      channels: { channels: [matrix, { ...ntfy, enabled: true }] },
      verification: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
      confirm: { verified: true },
    })
    renderPage()

    expect(await screen.findByText(/Zustand: ungeprüft/)).toBeTruthy()

    fireEvent.click(screen.getByText('Code senden'))
    expect(await screen.findByText(/Code gesendet/)).toBeTruthy()

    const requestMock = vi.mocked(fetch)
    await vi.waitFor(() => {
      expect(
        requestMock.mock.calls.some(
          ([input, init]) => String(input).endsWith('/verification') && init?.body === '{}',
        ),
      ).toBe(true)
    })

    fireEvent.change(screen.getByLabelText('Code aus der ntfy-App'), {
      target: { value: 'ABC234' },
    })
    fireEvent.click(screen.getByText('Code bestätigen'))

    const fetchMock = vi.mocked(fetch)
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/verification/confirm') &&
            String(init?.body).includes('ABC234'),
        ),
      ).toBe(true)
    })
  })

  it('shows the forbidden notice without notification.read', async () => {
    stub({ me: meResponse(['user.read']) })
    renderPage()

    expect(screen.queryByText(/^3 \w+/)).toBeNull()
  })
})
