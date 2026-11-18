import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { InboxPage } from '../inbox-page'

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'ntfy',
  eventType: 'ticket.created',
  state: 'SENT' as const,
  title: 'ST-2026-0001',
  body: 'normal · Rathaus',
  createdAt: '2026-11-17T09:30:00.000Z',
  readAt: null,
}

/**
 * No backend: the page reads the messages of the inbox, the web-push config of
 * WP-M14-124 and marks a message as read. The fake answers the routes of
 * WP-M14-120c and WP-M14-124 and records the read receipt, so the list, the
 * states, the setup link and the receipt run in memory.
 */
function stub(
  messages: unknown[] = [message],
  webPushConfig = { publicKey: '', subscribed: false, subscriptions: 0 },
) {
  const readReceipts: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/read') && init?.method === 'PATCH') {
        readReceipts.push(url)

        return Response.json({
          id: message.id,
          readAt: new Date().toISOString(),
        })
      }

      if (url.includes('/accounts/webpush')) {
        return Response.json(webPushConfig)
      }

      return Response.json({ messages })
    }),
  )

  return readReceipts
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/notifications']}>
          <InboxPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InboxPage', () => {
  it('lists the messages of the inbox with their channel and state', async () => {
    stub([
      message,
      {
        ...message,
        id: '22222222-2222-4222-8222-222222222222',
        state: 'FAILED',
        title: 'ST-2026-0002',
      },
    ])

    renderPage()

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()
    expect(screen.getByText('ST-2026-0002')).toBeTruthy()
    expect(screen.getByText('Zugestellt')).toBeTruthy()
    expect(screen.getByText('Fehlgeschlagen')).toBeTruthy()
    expect(screen.getAllByText('ntfy')).toHaveLength(2)
  })

  it('marks an unread message as read when it is clicked', async () => {
    const readReceipts = stub()

    renderPage()

    const entry = await screen.findByText('ST-2026-0001')

    fireEvent.click(entry)

    await vi.waitFor(() => {
      expect(readReceipts).toHaveLength(1)
    })
    expect(readReceipts[0]).toContain(message.id)
  })

  it('requests the chosen number of messages', async () => {
    const urls: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input))

      return Response.json({ messages: [] })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('Noch keine Nachricht.')

    expect(
      urls.some((url) => url.includes('/v1/notifications/messages') && url.includes('limit=50')),
    ).toBe(true)
  })

  it('shows the empty state without a message', async () => {
    stub([])

    renderPage()

    expect(await screen.findByText('Noch keine Nachricht.')).toBeTruthy()
  })

  it('names the setup page while web push is not set up (WP-M14-128)', async () => {
    stub([message])

    renderPage()

    const link = await screen.findByRole('link', { name: 'Open setup page' })

    expect(link.getAttribute('href')).toBe('/settings/notifications')
    expect(
      screen.getByText('Push notifications are not enabled in this browser yet.'),
    ).toBeTruthy()
  })

  it('shows no setup hint when this browser is registered for web push (WP-M14-128)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: true, subscriptions: 1 })

    renderPage()

    expect(screen.queryByRole('link', { name: 'Open setup page' })).toBeNull()
  })
})
