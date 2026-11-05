vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
}))
vi.mock('workbox-background-sync', () => ({
  BackgroundSyncPlugin: vi.fn(),
}))

import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearUserCache } from '../sw'

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

    expect(deleteCache).not.toHaveBeenCalledWith(
      expect.stringContaining('precache'),
    )
  })
})
