import { describe, expect, it, vi } from 'vitest'

import { BmaCloudError, createBmaCloudClient } from '../client'

const anlage = {
  aid: 'a-1',
  nr: '10372_01',
  firma: 'Example GmbH',
  anlagenort: 'Haus A',
  str: 'Musterweg 5',
  plz: '10115',
  ort: 'Berlin',
  status: 'active',
}

const baseUrl = 'https://bmacloud.example/api/v2'

function client(fetchImpl: typeof fetch, overrides: { baseUrl?: string; apiKey?: string } = {}) {
  return createBmaCloudClient(
    { baseUrl: overrides.baseUrl ?? baseUrl, apiKey: overrides.apiKey ?? 'secret-key' },
    fetchImpl,
  )
}

describe('createBmaCloudClient', () => {
  it('lists the Anlagen with one GET and a bearer header', async () => {
    const fetchMock = vi.fn(async () => Response.json([anlage]))

    const result = await client(fetchMock as unknown as typeof fetch).listAnlagen()

    expect(result).toEqual([anlage])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://bmacloud.example/api/v2/anlagen')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key')
  })

  it('joins a base URL with and without a trailing slash without doubling it', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url)
      return Response.json([anlage])
    })

    for (const suffix of ['/', '']) {
      await client(fetchMock as unknown as typeof fetch, { baseUrl: `${baseUrl}${suffix}` })
        .listAnlagen()
    }

    expect(urls).toEqual([
      'https://bmacloud.example/api/v2/anlagen',
      'https://bmacloud.example/api/v2/anlagen',
    ])
  })

  it('answers null for an unknown aid and the Anlage otherwise', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/anlagen/a-1') ? Response.json(anlage) : new Response('', { status: 404 }),
    )
    const bma = client(fetchMock as unknown as typeof fetch)

    expect(await bma.anlage('a-1')).toEqual(anlage)
    expect(await bma.anlage('missing')).toBeNull()
  })

  it('reports an HTTP error as bma_request_failed', async () => {
    const bma = client((async () => new Response('', { status: 500 })) as unknown as typeof fetch)

    await expect(bma.listAnlagen()).rejects.toMatchObject({ code: 'bma_request_failed' })
  })

  it('reports a non-array body as bma_bad_response', async () => {
    const bma = client(
      (async () => Response.json({ anlagen: [] })) as unknown as typeof fetch,
    )

    await expect(bma.listAnlagen()).rejects.toMatchObject({ code: 'bma_bad_response' })
  })

  it('refuses to call without a key, before any fetch happens', async () => {
    const fetchMock = vi.fn()
    const bma = client(fetchMock as unknown as typeof fetch, { apiKey: '  ' })

    await expect(bma.listAnlagen()).rejects.toBeInstanceOf(BmaCloudError)
    await expect(bma.listAnlagen()).rejects.toMatchObject({ code: 'bma_not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the anlagentypen reference list with one GET', async () => {
    const types = [
      { typid: 4, descr: 'Brandmeldeanlage', herstellername: 'Honeywell' },
      { typid: 7, descr: 'RWA' },
    ]
    const fetchMock = vi.fn(async () => Response.json(types))

    const result = await client(fetchMock as unknown as typeof fetch).anlagentypen()

    expect(result).toEqual(types)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://bmacloud.example/api/v2/anlagentypen')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key')
  })

  it('reports a non-array anlagentypen body and a failed call with its code', async () => {
    const bad = client((async () => Response.json({ typen: [] })) as unknown as typeof fetch)

    await expect(bad.anlagentypen()).rejects.toMatchObject({ code: 'bma_bad_response' })

    const failed = client(
      (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    )

    await expect(failed.anlagentypen()).rejects.toMatchObject({ code: 'bma_request_failed' })
  })

  it('never puts the key into an error message', async () => {
    const bma = client((async () => new Response('', { status: 502 })) as unknown as typeof fetch)

    const message = await bma.listAnlagen().then(
      () => '',
      (error: Error) => error.message,
    )

    expect(message).not.toContain('secret-key')
  })
})
