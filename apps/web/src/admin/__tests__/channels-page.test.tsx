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
  verification?: unknown
  confirm?: unknown
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
        return Response.json(routes.test ?? { delivered: true })
      }
      if (url.includes('/v1/admin/channels')) {
        if (init?.method === 'PATCH') return Response.json(matrix)
        return Response.json(routes.channels ?? { channels: [matrix, ntfy] })
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
  })

  it('marks a failed test send as failed and shows its code', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write']),
      test: { delivered: false, code: 'send_failed' },
    })
    renderPage()

    const buttons = await screen.findAllByText('Testnachricht senden')
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText('Testnachricht fehlgeschlagen (send_failed).')).toBeTruthy()
    expect(screen.getByText(/Zustand: fehlgeschlagen/)).toBeTruthy()
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

    expect(await screen.findByText('Keine Berechtigung.')).toBeTruthy()
  })
})
