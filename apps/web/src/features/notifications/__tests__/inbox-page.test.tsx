import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { InboxPage } from '../inbox-page'

const ownUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'ntfy',
  eventType: 'ticket.created',
  state: 'SENT' as const,
  title: 'ST-2026-0001',
  body: 'normal · Rathaus',
  createdAt: '2026-11-17T09:30:00.000Z',
  readAt: null,
  recipient: null,
}

/**
 * No backend: the page reads the messages of the inbox, the web-push config of
 * WP-M14-124 and marks a message as read. The fake answers the routes of
 * WP-M14-120c and WP-M14-124 and records the read receipt, so the list, the
 * states, the setup link and the receipt run in memory.
 *
 * The permissions of `/v1/me` decide whether the filter of WP-M14-141c is
 * shown: without `notification.read_all` the page stays the personal inbox.
 */
function stub(
  messages: unknown[] = [message],
  webPushConfig = { publicKey: '', subscribed: false, subscriptions: 0 },
  options: { permissions?: string[]; recipients?: unknown[]; registered?: boolean } = {},
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
          id: message.id,
          readAt: new Date().toISOString(),
        })
      }

      if (url.includes('/accounts/webpush/check')) {
        return Response.json({ registered: options.registered ?? true })
      }

      if (url.includes('/accounts/webpush')) {
        return Response.json(webPushConfig)
      }

      return Response.json({ messages, recipients: options.recipients ?? [] })
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

  it('links the ticket number of a ticket message to the ticket', async () => {
    stub()

    renderPage()

    const link = await screen.findByRole('link', { name: 'ST-2026-0001' })

    expect(link.getAttribute('href')).toBe('/tickets/ST-2026-0001')
  })

  it('keeps a readiness message without a ticket link', async () => {
    stub([{ ...message, eventType: 'oncall.assigned', title: 'Bereitschaft Nord' }])

    renderPage()

    expect(await screen.findByText('Bereitschaft Nord')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Bereitschaft Nord' })).toBeNull()
  })

  it('acknowledges an unread message with its own button', async () => {
    const readReceipts = stub()

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Quittieren' }))

    await vi.waitFor(() => {
      expect(readReceipts).toHaveLength(1)
    })
    expect(readReceipts[0]).toContain(message.id)
  })

  it('offers a quittature for every unread message of the own inbox', async () => {
    const readReceipts = stub([
      message,
      {
        ...message,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'ST-2026-0002',
      },
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

  it('names the missing server configuration instead of the browser (WP-M14-143)', async () => {
    stub([message])
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
    expect(helpLink.getAttribute('href')).toBe('/help/web-push')
    const link = await screen.findByRole('link', { name: i18n.t('inbox.webpush.setup') })
    expect(link.getAttribute('href')).toBe('/settings/notifications')
  })

  it('names this browser when it has no subscription (WP-M14-143)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: false, subscriptions: 0 })
    stubBrowser('not_subscribed')

    renderPage()

    const link = await screen.findByRole('link', { name: i18n.t('inbox.webpush.setup') })

    expect(link.getAttribute('href')).toBe('/settings/notifications')
    expect(screen.getByText(i18n.t('inbox.webpush.hint'))).toBeTruthy()
  })

  it('names a browser without a push manager (WP-M14-143)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: false, subscriptions: 0 })
    stubBrowser('unsupported')

    renderPage()

    expect(
      await screen.findByText('Dieser Browser kann keine Push-Benachrichtigungen empfangen.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('inbox.webpush.setup') })).toBeTruthy()
  })

  it('names a blocked permission of this browser (WP-M14-143)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: false, subscriptions: 0 })
    stubBrowser('denied')

    renderPage()

    expect(
      await screen.findByText('Die Push-Benachrichtigungen sind in diesem Browser gesperrt.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('inbox.webpush.setup') })).toBeTruthy()
  })

  it('shows no setup hint when this browser is registered for web push (WP-M14-143)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: true, subscriptions: 1 })
    stubBrowser('subscribed')

    renderPage()

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()
    expect(screen.queryByRole('link', { name: i18n.t('inbox.webpush.setup') })).toBeNull()
    expect(
      screen.queryByText(i18n.t('inbox.webpush.hint')),
    ).toBeNull()
  })

  it('names a device the server does not know (WP-M14-146)', async () => {
    stub(
      [message],
      { publicKey: 'vapid-public-key', subscribed: true, subscriptions: 1 },
      { registered: false },
    )
    stubBrowser('subscribed')

    renderPage()

    expect(
      await screen.findByText(
        'Der Server kennt dieses Gerät nicht — hier erreichen Sie keine Push-Benachrichtigungen.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('inbox.webpush.setup') })).toBeTruthy()
  })

  it('shows no setup hint while the browser has not answered (WP-M14-143)', async () => {
    stub([message], { publicKey: 'vapid-public-key', subscribed: false, subscriptions: 0 })
    stubBrowser('unknown')

    renderPage()

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()
    expect(screen.queryByRole('link', { name: i18n.t('inbox.webpush.setup') })).toBeNull()
  })

  it('shows no filter without the permission (WP-M14-141c)', async () => {
    stub([message])

    renderPage()

    expect(await screen.findByText('ST-2026-0001')).toBeTruthy()
    expect(screen.queryByText('Empfänger')).toBeNull()
    expect(screen.queryByText('Alle Kanäle')).toBeNull()
  })

  it('offers the unread filter to a user without the admin permission', async () => {
    const urls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        urls.push(url)

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
              permissions: [],
            },
          })
        }

        if (url.includes('/accounts/')) {
          return Response.json({ publicKey: '', subscribed: false, subscriptions: 0 })
        }

        return Response.json({ messages: [message], recipients: [] })
      }),
    )

    renderPage()

    fireEvent.click(await screen.findByLabelText('Nur ungelesene'))

    await waitFor(() => {
      expect(
        urls.some((url) => url.includes('/v1/notifications/messages') && url.includes('unread=true')),
      ).toBe(true)
    })
  })

  it('shows the filter with the permission and names the addressee of a row', async () => {
    stub(
      [
        {
          ...message,
          recipient: { userId: otherUserId, name: 'Otto Other' },
        },
      ],
      { publicKey: '', subscribed: false, subscriptions: 0 },
      {
        permissions: ['notification.read_all'],
        recipients: [{ userId: otherUserId, name: 'Otto Other', count: 3 }],
      },
    )

    renderPage()

    expect(await screen.findByText('Empfänger')).toBeTruthy()
    expect(screen.getByText('Alle Empfänger')).toBeTruthy()
    expect(screen.getByText('Alle Kanäle')).toBeTruthy()
    expect(screen.getByText('Alle Ereignisse')).toBeTruthy()
    expect(screen.getByText('Alle Zustände')).toBeTruthy()
    expect(screen.getByText('Nur ungelesene')).toBeTruthy()
    expect(screen.getAllByText(/Otto Other/).length).toBeGreaterThan(0)
  })

  it('sends the chosen filter to the API (WP-M14-141c)', async () => {
    const urls: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)

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
            permissions: ['notification.read_all'],
          },
        })
      }

      return Response.json({ messages: [], recipients: [] })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const select = await screen.findByLabelText('Kanal')

    fireEvent.change(select, { target: { value: 'ntfy' } })

    await waitFor(() => {
      expect(
        urls.some((url) => url.includes('/v1/notifications/messages') && url.includes('channel=ntfy')),
      ).toBe(true)
    })
  })

  it('takes no read receipt for the message of another user (WP-M14-141c)', async () => {
    const readReceipts = stub(
      [
        {
          ...message,
          recipient: { userId: otherUserId, name: 'Otto Other' },
        },
      ],
      { publicKey: '', subscribed: false, subscriptions: 0 },
      { permissions: ['notification.read_all'] },
    )

    renderPage()

    const entry = await screen.findByText('ST-2026-0001')

    fireEvent.click(entry)

    await waitFor(() => {
      expect(readReceipts).toHaveLength(0)
    })
  })
})
