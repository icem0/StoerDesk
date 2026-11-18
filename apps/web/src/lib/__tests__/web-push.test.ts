import { afterEach, describe, expect, it, vi } from 'vitest'

import { pushSupported, readBrowserPush } from '../web-push'

/**
 * The probe of the web push asks **this** browser for its own subscription.
 * The stubs below are the browser: a service worker registration with a push
 * manager, the permission of the notifications and the subscription itself.
 */
function stubBrowser({
  supported = true,
  permission = 'default',
  subscription = null as { endpoint: string } | null,
  registration = true,
}: {
  supported?: boolean
  permission?: NotificationPermission
  subscription?: { endpoint: string } | null
  registration?: boolean
} = {}) {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
  Reflect.deleteProperty(window, 'Notification')

  if (!supported) {
    return
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => {
        if (!registration) {
          return undefined
        }

        return { pushManager: { getSubscription: vi.fn(async () => subscription) } }
      }),
    },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
  Reflect.deleteProperty(window, 'Notification')
})

describe('pushSupported', () => {
  it('knows a browser without a push manager', () => {
    stubBrowser({ supported: false })

    expect(pushSupported()).toBe(false)
  })

  it('knows a browser with a push manager', () => {
    stubBrowser()

    expect(pushSupported()).toBe(true)
  })
})

describe('readBrowserPush', () => {
  it('names a browser that cannot deliver push at all', async () => {
    stubBrowser({ supported: false })

    expect(await readBrowserPush()).toEqual({ state: 'unsupported', endpoint: null })
  })

  it('names a blocked permission', async () => {
    stubBrowser({ permission: 'denied' })

    expect(await readBrowserPush()).toEqual({ state: 'denied', endpoint: null })
  })

  it('names the subscription of this browser with its endpoint', async () => {
    stubBrowser({ subscription: { endpoint: 'https://push.example.org/secret/42' } })

    expect(await readBrowserPush()).toEqual({
      state: 'subscribed',
      endpoint: 'https://push.example.org/secret/42',
    })
  })

  it('names a browser without a registration as not registered', async () => {
    stubBrowser({ registration: false })

    expect(await readBrowserPush()).toEqual({ state: 'not_subscribed', endpoint: null })
  })

  it('claims nothing when the browser does not answer', async () => {
    stubBrowser()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => {
          throw new Error('no service worker in this context')
        }),
      },
    })

    expect(await readBrowserPush()).toEqual({ state: 'unknown', endpoint: null })
  })
})
