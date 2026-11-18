import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import {
  WebPushSubscription,
  subscriptionBody,
  urlBase64ToUint8Array,
} from '../WebPushSubscription'

const PUBLIC_KEY = 'BOr8nQ'

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <WebPushSubscription />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubConfig(publicKey: string, subscriptions = 0, registered: boolean | null = true) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/webpush/check')) {
      return Response.json({ registered: registered ?? true })
    }

    return Response.json({ publicKey, subscribed: subscriptions > 0, subscriptions })
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.unstubAllGlobals()
})

describe('urlBase64ToUint8Array', () => {
  it('maps url-safe base64 back to the bytes of the key', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
  })

  it('accepts the url-safe alphabet without padding', () => {
    expect(Array.from(urlBase64ToUint8Array('-_-_'))).toEqual([251, 255, 191])
  })
})

describe('subscriptionBody', () => {
  it('carries the endpoint and the two keys of the browser subscription', () => {
    const subscription = {
      endpoint: 'https://push.example.org/secret/42',
      toJSON: () => ({
        endpoint: 'https://push.example.org/secret/42',
        keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      }),
    } as unknown as PushSubscription

    expect(subscriptionBody(subscription)).toEqual({
      endpoint: 'https://push.example.org/secret/42',
      keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
    })
  })
})

describe('WebPushSubscription', () => {
  it('names the missing configuration when the instance has no VAPID key', async () => {
    vi.stubGlobal('fetch', stubConfig(''))

    renderCard()

    expect(await screen.findByText(/nicht konfiguriert/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dieses Gerät anmelden' })).toBeNull()
  })

  it('names the missing browser support instead of offering a button', async () => {
    vi.stubGlobal('fetch', stubConfig(PUBLIC_KEY))

    renderCard()

    expect(await screen.findByText(/unterstützt keine Push-Nachrichten/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dieses Gerät anmelden' })).toBeNull()
  })

  it('asks for the permission and stores the subscription of the device', async () => {
    const subscription = {
      endpoint: 'https://push.example.org/secret/42',
      toJSON: () => ({
        endpoint: 'https://push.example.org/secret/42',
        keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    let current: unknown = null
    const pushManager = {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => {
        current = subscription

        return subscription
      }),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (init?.method === 'POST' && url.endsWith('/v1/notifications/accounts/webpush')) {
        return Response.json({ subscribed: true })
      }

      if (url.endsWith('/v1/notifications/accounts/webpush/check')) {
        return Response.json({ registered: true })
      }

      return Response.json({ publicKey: PUBLIC_KEY, subscribed: false, subscriptions: 0 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Dieses Gerät anmelden' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/notifications/accounts/webpush',
        expect.objectContaining({ method: 'POST' }),
      ),
    )

    const init = fetchMock.mock.calls.find(([, request]) => request?.method === 'POST')?.[1] as
      RequestInit | undefined

    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: 'https://push.example.org/secret/42',
      keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
    })
    expect(await screen.findByText('Dieses Gerät ist angemeldet.')).toBeTruthy()
  })

  it('names the device that this browser holds', async () => {
    const subscription = {
      endpoint: 'https://push.example.org/secret/42',
      toJSON: () => ({
        endpoint: 'https://push.example.org/secret/42',
        keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn().mockResolvedValue(subscription),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('fetch', stubConfig(PUBLIC_KEY, 1))

    renderCard()

    expect(await screen.findByText('Dieses Gerät ist angemeldet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dieses Gerät anmelden' })).toBeNull()
  })

  it('names the blocked permission of this browser', async () => {
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn(),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    vi.stubGlobal('fetch', stubConfig(PUBLIC_KEY))

    renderCard()

    expect(await screen.findByText(/Benachrichtigungs-Erlaubnis wurde nicht erteilt/)).toBeTruthy()
    expect(screen.queryByText('Dieses Gerät ist angemeldet.')).toBeNull()
  })

  it('names a device the server does not know (WP-M14-145)', async () => {
    const subscription = {
      endpoint: 'https://push.example.org/secret/42',
      toJSON: () => ({
        endpoint: 'https://push.example.org/secret/42',
        keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn().mockResolvedValue(subscription),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('fetch', stubConfig(PUBLIC_KEY, 0, false))

    renderCard()

    expect(
      await screen.findByText(
        'Der Server kennt dieses Gerät nicht — Push-Benachrichtigungen erreichen Sie hier nicht.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dieses Gerät anmelden' })).toBeTruthy()
    expect(screen.queryByText('Dieses Gerät ist angemeldet.')).toBeNull()
  })

  it('claims nothing while the server has not answered (WP-M14-145)', async () => {
    const subscription = {
      endpoint: 'https://push.example.org/secret/42',
      toJSON: () => ({
        endpoint: 'https://push.example.org/secret/42',
        keys: { p256dh: 'BPm1p256dh', auth: 'authSecret42' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn().mockResolvedValue(subscription),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/webpush/check')) {
          return Response.json({}, { status: 500 })
        }

        return Response.json({ publicKey: PUBLIC_KEY, subscribed: true, subscriptions: 1 })
      }),
    )

    renderCard()

    expect(await screen.findByText('1 Geräte sind für dieses Konto angemeldet.')).toBeTruthy()
    expect(screen.queryByText('Dieses Gerät ist angemeldet.')).toBeNull()
    expect(
      screen.queryByText(
        'Der Server kennt dieses Gerät nicht — Push-Benachrichtigungen erreichen Sie hier nicht.',
      ),
    ).toBeNull()
  })
})
