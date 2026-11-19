import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { NotificationBell } from '../notification-bell'

/**
 * No backend: the bell reads only the unread count of WP-M14-120c. The fake
 * answers that route, so the badge runs in memory and the inbox page is reached
 * through the link of the bell, never through a request of the bell itself.
 */
function stub(unread = 2) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/unread-count')) {
        return Response.json({ count: unread })
      }

      return Response.json({ messages: [] })
    }),
  )
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

    expect(await screen.findByRole('link', { name: 'Benachrichtigungen' })).toBeTruthy()
    expect(screen.queryByTestId('unread-count')).toBeNull()
  })

  it('is one link that opens the inbox page', async () => {
    stub(1)

    renderBell()

    const link = screen.getByRole('link', { name: 'Benachrichtigungen' })
    expect(link.getAttribute('href')).toBe('/notifications')
    expect(screen.queryByText('ST-2026-0001')).toBeNull()
  })

  it('paints the accent of the instance like an entry of the menu (WP-M16-04)', async () => {
    stub(4)

    renderBell()

    expect(await screen.findByTestId('unread-count')).toBeTruthy()

    const link = screen.getByRole('link', { name: 'Benachrichtigungen' })
    expect(link.getAttribute('class')).toContain('min-h-11')
    expect(link.getAttribute('class')).toContain('text-accent-300')
  })

  it('shows no messages and fetches none by itself', async () => {
    stub(1)

    renderBell()

    expect(screen.queryByText('Zugestellt')).toBeNull()
  })
})
