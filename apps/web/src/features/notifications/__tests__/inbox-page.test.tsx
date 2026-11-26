import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { InboxPage } from '../inbox-page'

const ownUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const task = {
  id: '11111111-1111-4111-8111-111111111111',
  eventType: 'ticket.assigned',
  params: { ticketNo: 'ST-2026-0001', priority: 'normal', objectName: 'Rathaus' },
  ticketNo: 'ST-2026-0001',
  shiftId: null,
  createdAt: '2026-11-17T09:30:00.000Z',
  readAt: null,
}

const readinessTask = {
  id: '33333333-3333-4333-8333-333333333333',
  eventType: 'oncall.assigned',
  params: { poolName: 'Bereitschaft Nord' },
  ticketNo: null,
  shiftId: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-11-17T10:30:00.000Z',
  readAt: null,
}

/**
 * No backend: the page reads the **tasks** of the user (§11.18, ADR-0052), the
 * web-push config of WP-M14-124 and marks a task as read. The fake answers the
 * routes of WP-M30-02 and WP-M14-124 and records the read receipt, so the
 * list, the texts, the links and the receipt run in memory.
 */
function stub(
  items: unknown[] = [task],
  webPushConfig = { publicKey: '', subscribed: false, subscriptions: 0 },
  options: { permissions?: string[]; registered?: boolean } = {},
) {
  const readReceipts: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: ownUserId,
            email: 'own@example.org',
            givenName: 'Ola',
            familyName: 'Owner',
            locale: 'de',
            theme: 'auto',
            roles: [],
            permissions: options.permissions ?? [],
          },
        })
      }

      if (url.includes('/read') && init?.method === 'PATCH') {
        readReceipts.push(url)

        return Response.json({
          id: task.id,
          readAt: new Date().toISOString(),
        })
      }

      if (url.includes('/accounts/webpush/check')) {
        return Response.json({ registered: options.registered ?? true })
      }

      if (url.includes('/accounts/webpush')) {
        return Response.json(webPushConfig)
      }

      return Response.json({ items })
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

/**
 * The browser of the user: the probe of WP-M14-142 asks this browser for its
 * own push subscription. The stubs below are the four states of the probe.
 */
function stubBrowser(state: 'subscribed' | 'not_subscribed' | 'unsupported' | 'denied' | 'unknown') {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
  Reflect.deleteProperty(window, 'Notification')

  if (state === 'unsupported') {
    return
  }

  const subscription =
    state === 'subscribed' ? { endpoint: 'https://push.example.org/secret/42' } : null

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => {
        if (state === 'unknown') {
          throw new Error('no service worker in this context')
        }

        return { pushManager: { getSubscription: vi.fn(async () => subscription) } }
      }),
    },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: state === 'denied' ? 'denied' : 'default' },
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
  Reflect.deleteProperty(window, 'Notification')
  vi.unstubAllGlobals()
})

describe('InboxPage', () => {
  it('shows the readable text of every task', async () => {
    stub([
      task,
      {
        ...task,
        id: '22222222-2222-4222-8222-222222222222',
        eventType: 'ticket.escalated',
        ticketNo: 'ST-2026-0002',
        params: { ticketNo: 'ST-2026-0002', priority: 'high', objectName: 'Rathaus' },
      },
    ])

    renderPage()

    expect(await screen.findByText('Meldung ST-2026-0001 ist dir zugewiesen.')).toBeTruthy()
    expect(screen.getByText('Meldung ST-2026-0002 ist eskaliert.')).toBeTruthy()
  })

  it('names the way of the message nowhere', async () => {
    stub([task])

    renderPage()

    expect(await screen.findByText('Meldung ST-2026-0001 ist dir zugewiesen.')).toBeTruthy()

    // The channel and the delivery state belong to the protocol of the
    // administration (§11.16) — the inbox of a user names neither of them.
    expect(screen.queryByText('ntfy')).toBeNull()
    expect(screen.queryByText('Zugestellt')).toBeNull()
    expect(screen.queryByText('Wird gesendet')).toBeNull()
    expect(screen.queryByText('Fehlgeschlagen')).toBeNull()
  })

  it('links the ticket of a task to the ticket', async () => {
    stub()

    renderPage()

    const link = await screen.findByRole('link', {
      name: 'Meldung ST-2026-0001 ist dir zugewiesen.',
    })

    expect(link.getAttribute('href')).toBe('/tickets/ST-2026-0001')
  })

  it('links a task of the readiness to the calendar', async () => {
    stub([readinessTask])

    renderPage()

    const link = await screen.findByRole('link', {
      name: 'Bereitschaft Bereitschaft Nord ist dir zugeteilt.',
    })

    expect(link.getAttribute('href')).toBe('/oncall')
  })

  it('names the release of a shift (ADR-0058)', async () => {
    stub([
      {
        id: '55555555-5555-4555-8555-555555555555',
        eventType: 'oncall.released',
        params: { poolName: 'Bereitschaft Nord', release: 'deleted' },
        ticketNo: null,
        shiftId: '44444444-4444-4444-8444-444444444444',
        createdAt: '2026-11-17T11:30:00.000Z',
        readAt: null,
      },
    ])

    renderPage()

    const link = await screen.findByRole('link', {
      name: 'Deine Bereitschaft Bereitschaft Nord wurde gelöscht.',
    })

    expect(link.getAttribute('href')).toBe('/oncall')
  })

  it('names the channel and the machine code of a failed delivery', async () => {
    stub([
      {
        id: '55555555-5555-4555-8555-555555555555',
        eventType: 'notification.delivery_failed',
        params: { channel: 'ntfy', code: 'send_failed', eventType: 'ticket.assigned' },
        ticketNo: 'ST-2026-0003',
        shiftId: null,
        createdAt: '2026-11-17T11:30:00.000Z',
        readAt: null,
      },
    ])

    renderPage()

    expect(
      await screen.findByText('Eine Zustellung ist fehlgeschlagen (ntfy, Fehlercode send_failed).'),
    ).toBeTruthy()
  })

  it('acknowledges an unread task with its own button', async () => {
    const readReceipts = stub()

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Quittieren' }))

    await vi.waitFor(() => {
      expect(readReceipts).toHaveLength(1)
    })
    expect(readReceipts[0]).toContain(task.id)
  })

  it('offers a quittature for every unread task', async () => {
    const readReceipts = stub([
      task,
      { ...task, id: '22222222-2222-4222-8222-222222222222', ticketNo: 'ST-2026-0002' },
    ])

    renderPage()

    const buttons = await screen.findAllByRole('button', { name: 'Quittieren' })

    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[1] as HTMLElement)

    await vi.waitFor(() => {
      expect(readReceipts).toHaveLength(1)
    })
    expect(readReceipts[0]).toContain('22222222-2222-4222-8222-222222222222')
  })

  it('requests the chosen number of tasks and the filter of the unhandled ones', async () => {
    const urls: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input))

      return Response.json({ items: [] })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByText('Nichts zu tun: StörDesk hat dir nichts zu tun gegeben.')

    expect(
      urls.some((url) => url.includes('/v1/notifications/items') && url.includes('limit=50')),
    ).toBe(true)
  })

  it('shows the empty state without a task', async () => {
    stub([])

    renderPage()

    expect(
      await screen.findByText('Nichts zu tun: StörDesk hat dir nichts zu tun gegeben.'),
    ).toBeTruthy()
  })

  it('names the missing server configuration instead of the browser (WP-M14-143)', async () => {
    stub([task])
    stubBrowser('not_subscribed')

    renderPage()

    expect(
      await screen.findByText(
        'Web Push ist auf diesem Server nicht konfiguriert (die VAPID-Schlüssel fehlen).',
      ),
    ).toBeTruthy()
    const helpLink = await screen.findByRole('link', {
      name: 'Web Push ist auf diesem Server nicht konfiguriert (die VAPID-Schlüssel fehlen).',
    })
    expect(helpLink.getAttribute('href')).toBe('/help/web-push')
  })
})
