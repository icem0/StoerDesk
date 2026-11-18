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
  ticketDetailUrl,
} from '../sw'

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
  it('focuses an open window of the target', async () => {
    const focus = vi.fn().mockResolvedValue(undefined)
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = {
      matchAll: vi.fn().mockResolvedValue([{ url: 'https://app.example/inbox', focus }]),
      openWindow,
    }

    await focusOrOpen(clients, 'https://app.example/inbox')

    expect(focus).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a window when the target is not open', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = {
      matchAll: vi.fn().mockResolvedValue([{ url: 'https://app.example/', focus: vi.fn() }]),
      openWindow,
    }

    await focusOrOpen(clients, 'https://app.example/inbox')

    expect(openWindow).toHaveBeenCalledWith('https://app.example/inbox')
  })

  it('opens the app root for an empty url', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow }

    await focusOrOpen(clients, '')

    expect(openWindow).toHaveBeenCalledWith('/')
  })
})
