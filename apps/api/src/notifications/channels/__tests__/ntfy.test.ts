import { describe, expect, it, vi } from 'vitest'

import { sendNtfyNotification } from '../ntfy'

describe('sendNtfyNotification', () => {
  const config = { url: 'https://ntfy.sh', topic: 'stoerdesk' }

  it('posts a JSON notification to the topic', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/stoerdesk')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect((init.headers as Record<string, string>).Priority).toBe('default')

    const payload = JSON.parse(String(init.body)) as {
      title: string
      message: string
      priority: string
      actions: { action: string; label: string; uri: string }[]
    }
    expect(payload.title).toBe('New ticket')
    expect(payload.message).toBe('Lift 2 is broken')
    expect(payload.priority).toBe('default')
    expect(payload.actions).toEqual([
      { action: 'view', label: 'Öffnen', uri: 'https://stoerdesk.local/pwa' },
    ])
  })

  it('sends the urgent priority of a critical ticket (WP-M14-07)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'ST-2026-0001', body: 'critical · Rathaus', priority: 'critical' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Priority).toBe('urgent')

    const payload = JSON.parse(String(init.body)) as { priority: string }
    expect(payload.priority).toBe('urgent')
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
        actions: { action: string; label: string; uri: string }[]
      }

      expect(payload.actions).toEqual([
        { action: 'view', label: testCase.label, uri: 'https://stoerdesk.local/pwa' },
      ])
    }
  })

  it('still sends when the pwaUrl is empty', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendNtfyNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { actions: { uri: string }[] }
    expect(payload.actions).toEqual([{ action: 'view', label: 'Öffnen', uri: '' }])
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
})
