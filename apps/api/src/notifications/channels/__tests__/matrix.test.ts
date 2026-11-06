import { describe, expect, it, vi } from 'vitest'

import { sendMatrixNotification } from '../matrix'

describe('sendMatrixNotification', () => {
  const config = {
    homeserver: 'http://matrix:8008',
    roomId: '!abc:matrix.localhost',
    accessToken: 'token',
  }

  it('sends the message to the room via the client-server API', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendMatrixNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/_matrix/client/v3/rooms/')
    expect(url).toContain('/send/m.room.message/')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token')

    const payload = JSON.parse(String(init.body)) as { msgtype: string; body: string }
    expect(payload.msgtype).toBe('m.text')
    expect(payload.body).toContain('New ticket')
    expect(payload.body).toContain('Öffnen: https://stoerdesk.local/pwa')
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

      await sendMatrixNotification(
        { ...config, locale: testCase.locale },
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      )

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const payload = JSON.parse(String(init.body)) as { body: string }
      expect(payload.body).toBe(
        `New ticket\nLift 2 is broken\n\n${testCase.label}: https://stoerdesk.local/pwa`,
      )
    }
  })

  it('keeps the message alone while the PWA url is empty', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendMatrixNotification(
      config,
      { title: 'New ticket', body: 'Lift 2 is broken' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { body: string }
    expect(payload.body).toBe('New ticket\nLift 2 is broken')
  })

  it('reports HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 403 }))

    await expect(
      sendMatrixNotification(
        config,
        { title: 'New ticket', body: 'Lift 2 is broken' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/403/)
  })
})
