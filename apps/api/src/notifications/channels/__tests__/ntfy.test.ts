import { describe, expect, it, vi } from 'vitest'

import { sendNtfyNotification } from '../ntfy'

describe('sendNtfyNotification', () => {
  const config = { url: 'https://ntfy.sh', topic: 'stoerdesk' }

  it('posts a JSON notification to the server root with the topic in the body', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect((init.headers as Record<string, string>).Priority).toBe('3')

    const payload = JSON.parse(String(init.body)) as {
      topic: string
      title: string
      message: string
      priority: number
      actions: { action: string; label: string; url: string }[]
    }
    expect(payload.topic).toBe('stoerdesk')
    expect(payload.title).toBe('New ticket')
    expect(payload.message).toBe('Lift 2 is broken\n\nÖffnen: https://stoerdesk.local/pwa')
    expect(payload.priority).toBe(3)
    expect(payload.actions).toEqual([
      { action: 'view', label: 'Öffnen', url: 'https://stoerdesk.local/pwa' },
    ])
  })

  it('sends the max priority of a critical ticket as the number 5 (WP-M14-07)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'ST-2026-0001', body: 'critical · Rathaus', priority: 'critical' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Priority).toBe('5')

    const payload = JSON.parse(String(init.body)) as { priority: number }
    expect(payload.priority).toBe(5)
  })

  it('sends the explicit level of an escalation action (WP-M14-89)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'ST-2026-0001', body: 'critical · Rathaus', priority: 'critical', ntfyPriority: 2 },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Priority).toBe('2')

    const payload = JSON.parse(String(init.body)) as { priority: number }
    expect(payload.priority).toBe(2)
  })

  it('sends to the topic of the account when the caller provides it (WP-M14-13)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      { ...config, userTopic: 'stoerdesk-admin' },
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/')

    const payload = JSON.parse(String(init.body)) as { topic: string }
    expect(payload.topic).toBe('stoerdesk-admin')
  })

  it('labels the view action in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

      await sendNtfyNotification(
        { ...config, locale: testCase.locale },
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      )

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const payload = JSON.parse(String(init.body)) as {
        actions: { action: string; label: string; url: string }[]
      }

      expect(payload.actions).toEqual([
        { action: 'view', label: testCase.label, url: 'https://stoerdesk.local/pwa' },
      ])
    }
  })

  it('still sends when the pwaUrl is empty and omits the invalid empty view action', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { actions?: unknown }
    expect(payload.actions).toBeUndefined()
  })

  it('reports HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    await expect(
      sendNtfyNotification(
        config,
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/500/)
  })

  it('names the HTTP status in the error code (WP-M14-49)', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 407 }))

    const errors: unknown[] = []

    try {
      await sendNtfyNotification(
        config,
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      )
    } catch (error) {
      errors.push(error)
    }

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect((errors[0] as { code?: string }).code).toBe('http_407')
  })

  it('sends the access token in the Authorization header only (WP-M14-51, ADR-0022)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      { ...config, token: 'tk_secret' },
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tk_secret')
    expect(String(init.body).includes('tk_secret')).toBe(false)
  })

  it('fails as http_timeout when the server does not answer in time (WP-M14-53)', async () => {
    const lateFetch = vi.fn(
      async (_: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal
        if (signal) {
          await new Promise((resolve) => signal.addEventListener('abort', resolve))
        }

        return new Response('{}', { status: 200 })
      },
    )

    await expect(
      sendNtfyNotification(
        { ...config, timeoutMs: 5 },
        { title: 'New ticket', body: 'Lift 2 is broken' },
        '',
        lateFetch as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: 'http_timeout' })
  })
})
