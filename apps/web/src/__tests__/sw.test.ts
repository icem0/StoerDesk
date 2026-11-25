vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
}))
vi.mock('workbox-background-sync', () => ({
  BackgroundSyncPlugin: vi.fn(),
}))

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearUserCache,
  focusOrOpen,
  invalidateCachedTicket,
  notificationFromPayload,
  registerTakeover,
  ticketDetailUrl,
} from '../sw'
import type { ServiceWorkerEvents } from '../sw'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('clearUserCache', () => {
  it('deletes only the internal-tickets cache and answers on the port', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    const port = { postMessage: vi.fn() } as unknown as MessagePort
    const cacheStorage = { delete: deleteCache } as unknown as CacheStorage

    await clearUserCache(cacheStorage, port)

    expect(deleteCache).toHaveBeenCalledTimes(1)
    expect(deleteCache).toHaveBeenCalledWith('internal-tickets')
    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'CLEAR_USER_CACHE_DONE' })
  })

  it('never touches the precache', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    const port = { postMessage: vi.fn() } as unknown as MessagePort
    const cacheStorage = { delete: deleteCache } as unknown as CacheStorage

    await clearUserCache(cacheStorage, port)

    expect(deleteCache).not.toHaveBeenCalledWith(expect.stringContaining('precache'))
  })
})

describe('ticketDetailUrl', () => {
  it('turns a write URL into the detail URL of that ticket', () => {
    expect(ticketDetailUrl('https://app.example/api/v1/tickets/ST-2026-0001/comments')).toBe(
      'https://app.example/api/v1/tickets/ST-2026-0001',
    )
  })

  it('rejects a URL that is not a write to a ticket', () => {
    expect(ticketDetailUrl('not a url')).toBeNull()
    expect(ticketDetailUrl('https://app.example/api/v1/tickets')).toBeNull()
  })
})

describe('invalidateCachedTicket', () => {
  function cacheStorageWith(keys: string[]) {
    const deleteEntry = vi.fn().mockResolvedValue(true)
    const cache = {
      keys: vi.fn().mockResolvedValue(keys.map((url) => ({ url }))),
      delete: deleteEntry,
    }
    const cacheStorage = { open: vi.fn().mockResolvedValue(cache) } as unknown as CacheStorage

    return { cacheStorage, cache, deleteEntry }
  }

  it('drops the cached copy of the written ticket', async () => {
    const { cacheStorage, cache, deleteEntry } = cacheStorageWith([
      'https://app.example/api/v1/tickets/ST-2026-0001',
      'https://app.example/api/v1/tickets/ST-2026-0002',
    ])

    await invalidateCachedTicket(
      cacheStorage,
      'https://app.example/api/v1/tickets/ST-2026-0001/comments',
    )

    expect(cacheStorage.open).toHaveBeenCalledWith('internal-tickets')
    expect(deleteEntry).toHaveBeenCalledTimes(1)
    expect(cache.delete).toHaveBeenCalledWith({
      url: 'https://app.example/api/v1/tickets/ST-2026-0001',
    })
  })

  it('keeps the cached copies of the other tickets', async () => {
    const { cacheStorage, deleteEntry } = cacheStorageWith([
      'https://app.example/api/v1/tickets/ST-2026-0002',
    ])

    await invalidateCachedTicket(
      cacheStorage,
      'https://app.example/api/v1/tickets/ST-2026-0001/comments',
    )

    expect(deleteEntry).not.toHaveBeenCalled()
  })
})

describe('registerTakeover', () => {
  function fakeEvents() {
    const listeners = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>()

    const events: ServiceWorkerEvents = {
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
    }

    return { events, listeners }
  }

  it('lets the new worker take over the open pages at once', () => {
    const skipWaiting = vi.fn().mockResolvedValue(undefined)
    const claim = vi.fn().mockResolvedValue(undefined)
    const { events, listeners } = fakeEvents()

    registerTakeover({ skipWaiting, clients: { claim } }, events)

    const waited: Promise<unknown>[] = []
    const event = { waitUntil: (promise: Promise<unknown>) => waited.push(promise) }

    listeners.get('install')?.(event)
    listeners.get('activate')?.(event)

    expect(skipWaiting).toHaveBeenCalledTimes(1)
    expect(claim).toHaveBeenCalledTimes(1)
    expect(waited).toHaveLength(2)
  })

  it('registers both listeners of the lifecycle', () => {
    const { events, listeners } = fakeEvents()

    registerTakeover(
      { skipWaiting: vi.fn(), clients: { claim: vi.fn() } },
      events,
    )

    expect([...listeners.keys()]).toEqual(['install', 'activate'])
  })
})

describe('notificationFromPayload', () => {
  it('splits title, body and the localized deep link', () => {
    expect(
      notificationFromPayload(
        'T-2026-0007\nurgent · Lift 2\n\nÖffnen: https://app.example/tickets/ST-2026-0007',
      ),
    ).toEqual({
      title: 'T-2026-0007',
      body: 'urgent · Lift 2',
      url: 'https://app.example/tickets/ST-2026-0007',
    })
  })

  it('keeps the payload without a deep link and falls back to the brand', () => {
    expect(notificationFromPayload('\njust a body')).toEqual({
      title: 'StörDesk',
      body: 'just a body',
      url: '',
    })
  })
})

describe('focusOrOpen', () => {
  const origin = 'https://app.example'

  it('focuses an open window of the target', async () => {
    const focus = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn().mockResolvedValue(undefined)
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = {
      matchAll: vi.fn().mockResolvedValue([{ url: 'https://app.example/inbox', focus, navigate }]),
      openWindow,
    }

    await focusOrOpen(clients, 'https://app.example/inbox', origin)

    expect(focus).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('navigates the open window of the app instead of opening a second one', async () => {
    const focus = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn().mockResolvedValue(undefined)
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = {
      matchAll: vi.fn().mockResolvedValue([{ url: 'https://app.example/', focus, navigate }]),
      openWindow,
    }

    await focusOrOpen(clients, 'https://app.example/tickets/ST-2026-0001', origin)

    expect(focus).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('https://app.example/tickets/ST-2026-0001')
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a window when the app is not open', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow }

    await focusOrOpen(clients, 'https://app.example/tickets/ST-2026-0001', origin)

    expect(openWindow).toHaveBeenCalledWith('https://app.example/tickets/ST-2026-0001')
  })

  it('opens a link of another origin in a window', async () => {
    const focus = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn().mockResolvedValue(undefined)
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = {
      matchAll: vi.fn().mockResolvedValue([{ url: 'https://app.example/', focus, navigate }]),
      openWindow,
    }

    await focusOrOpen(clients, 'https://other.example/tickets/ST-2026-0001', origin)

    expect(openWindow).toHaveBeenCalledWith('https://other.example/tickets/ST-2026-0001')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens the app root for an empty url', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow }

    await focusOrOpen(clients, '', origin)

    expect(openWindow).toHaveBeenCalledWith('https://app.example/')
  })
})
