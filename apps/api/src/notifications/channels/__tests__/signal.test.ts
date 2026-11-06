import { describe, expect, it, vi } from 'vitest'

import { sendSignalNotification } from '../signal'

describe('sendSignalNotification', () => {
  const config = {
    url: 'http://signal-cli:8080',
    source: '+49123456789',
    recipients: ['+49987654321'],
  }

  it('posts a JSON-RPC send request to the bridge', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ result: {} }), { status: 200 }),
    )

    await sendSignalNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://signal-cli:8080/api/v1/rpc')
    expect(init.method).toBe('POST')

    const payload = JSON.parse(String(init.body)) as {
      jsonrpc: string
      method: string
      params: { message: string; recipient: string[]; source: string }
    }

    expect(payload.jsonrpc).toBe('2.0')
    expect(payload.method).toBe('send')
    expect(payload.params.recipient).toEqual(['+49987654321'])
    expect(payload.params.source).toBe('+49123456789')
    expect(payload.params.message).toContain('New ticket')
    expect(payload.params.message).toContain('Lift 2 is broken')
    expect(payload.params.message).toContain('Öffnen: https://stoerdesk.local/pwa')
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ result: {} }), { status: 200 }),
      )

      await sendSignalNotification(
        { ...config, locale: testCase.locale },
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      )

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const payload = JSON.parse(String(init.body)) as {
        params: { message: string }
      }
      expect(payload.params.message).toBe(
        `New ticket\nLift 2 is broken\n\n${testCase.label}: https://stoerdesk.local/pwa`,
      )
    }
  })

  it('keeps the message alone while the PWA url is empty', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ result: {} }), { status: 200 }),
    )

    await sendSignalNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as {
      params: { message: string }
    }
    expect(payload.params.message).toBe('New ticket\nLift 2 is broken')
  })

  it('fails when no recipient is configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await expect(
      sendSignalNotification(
        { ...config, recipients: [] },
        { title: 'New ticket', body: 'Lift 2 is broken' },
        '',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/No Signal recipients/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    await expect(
      sendSignalNotification(
        config,
        { title: 'New ticket', body: 'Lift 2 is broken' },
        '',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/500/)
  })

  it('reports JSON-RPC errors', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: -1, message: 'not registered' } }), {
          status: 200,
        }),
    )

    await expect(
      sendSignalNotification(
        config,
        { title: 'New ticket', body: 'Lift 2 is broken' },
        '',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/not registered/)
  })
})
