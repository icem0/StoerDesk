import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { ChannelPage } from '../channel-page'

function renderChannel(kind: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/admin/channels/${kind}`]}>
          <Routes>
            <Route path="/admin/channels/:kind" element={<ChannelPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const channels = [
  {
    kind: 'matrix',
    label: 'Matrix',
    config: { homeserver: 'https://matrix.example.org', roomId: '!room:example.org' },
    enabled: true,
    secretSet: true,
    verified: true,
  },
  {
    kind: 'signal',
    label: 'Signal',
    config: { cliUrl: 'https://signal.example.org', sourceNumber: '+49123456789', recipients: ['+49987654321'] },
    enabled: true,
    secretSet: false,
    verified: true,
  },
]

function stub(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/v1/me')) {
        return Response.json({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'admin@example.com',
            locale: 'de',
            roles: ['admin'],
            permissions,
          },
        })
      }

      if (url.includes('/v1/admin/channels')) {
        return Response.json({ channels })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

describe('ChannelPage', () => {
  it('shows the matrix channel with its fields', async () => {
    stub(['notification.read', 'notification.write'])

    renderChannel('matrix')

    expect(await screen.findByRole('heading', { name: 'Matrix' })).toBeTruthy()
    expect(document.getElementById('matrix-homeserver')).not.toBeNull()
    expect(document.getElementById('matrix-roomId')).not.toBeNull()
  })

  it('shows the signal channel with its fields', async () => {
    stub(['notification.read', 'notification.write'])

    renderChannel('signal')

    expect(await screen.findByRole('heading', { name: 'Signal' })).toBeTruthy()
    expect(document.getElementById('signal-cliUrl')).not.toBeNull()
    expect(document.getElementById('signal-sourceNumber')).not.toBeNull()
    expect(document.getElementById('signal-recipients')).not.toBeNull()
  })

  it('names an unknown channel as not found', async () => {
    stub(['notification.read', 'notification.write'])

    renderChannel('does-not-exist')

    expect(await screen.findByText(/nicht gefunden/i)).toBeTruthy()
  })
})
