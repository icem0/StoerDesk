import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { NotificationBell } from '../notification-bell'

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
 * No backend: the bell reads the unread count and, while the panel is open, the
 * latest messages of the inbox. The fake answers both routes of WP-M14-120c
 * and records the read receipt, so the badge, the panel and the receipt run in
 * memory.
 */
function stub(unread = 2, messages: unknown[] = [message]) {
  const readReceipts: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/read') && init?.method === 'PATCH') {
        readReceipts.push(url)

        return Response.json({ id: message.id, readAt: new Date().toISOString() })
      }

      if (url.includes('/unread-count')) {
        return Response.json({ count: unread })
      }

      return Response.json({ messages })
    }),
  )

  return readReceipts
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/']}>
          <NotificationBell />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationBell', () => {
  it('shows the number of the unread messages', async () => {
    stub(3)

    renderBell()

    expect(await screen.findByTestId('unread-count')).toBeTruthy()
    expect(screen.getByTestId('unread-count').textContent).toBe('3')
  })

  it('shows no badge when every message is read', async () => {
    stub(0)

    renderBell()

    expect(await screen.findByRole('button', { name: 'Benachrichtigungen' })).toBeTruthy()
    expect(screen.queryByTestId('unread-count')).toBeNull()
  })

  it('opens the panel with the latest messages and links to the inbox', async () => {
    stub(1, [message, { ...message, id: '22222222-2222-4222-8222-222222222222', state: 'FAILED', title: 'ST-2026-0002' }])

    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen' }))

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()
    expect(screen.getByText('ST-2026-0002')).toBeTruthy()
    expect(screen.getByText('Zugestellt')).toBeTruthy()
    expect(screen.getByText('Fehlgeschlagen')).toBeTruthy()
    expect(screen.getAllByText('Neu')).toHaveLength(2)

    const link = screen.getByRole('link', { name: 'Alle Nachrichten anzeigen' })
    expect(link.getAttribute('href')).toBe('/notifications')
  })

  it('marks a message as read when it is clicked in the panel', async () => {
    const readReceipts = stub(1)

    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen' }))

    fireEvent.click(await screen.findByText('ST-2026-0001'))

    await vi.waitFor(() => {
      expect(readReceipts).toHaveLength(1)
    })
    expect(readReceipts[0]).toContain(message.id)
  })

  it('closes the panel when the escape key is pressed', async () => {
    stub(1)

    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen' }))

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    await vi.waitFor(() => {
      expect(screen.queryByText('ST-2026-0001')).toBeNull()
    })
  })
})
