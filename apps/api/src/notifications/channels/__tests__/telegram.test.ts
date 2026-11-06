import { describe, expect, it, vi } from 'vitest'

import { sendTelegramNotification } from '../telegram'

describe('sendTelegramNotification', () => {
  const config = { token: '123456:ABC-def', chatId: '@stoerdesk' }

  it('posts a JSON message to the Bot API', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendTelegramNotification(
      config,
      { title: 'T-2026-0007', body: 'urgent · Lift 2' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/bot123456:ABC-def/sendMessage')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')

    const payload = JSON.parse(String(init.body)) as { chat_id: string; text: string }
    expect(payload.chat_id).toBe('@stoerdesk')
    expect(payload.text).toBe('T-2026-0007\nurgent · Lift 2\n\nÖffnen: https://stoerdesk.local/pwa')
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

      await sendTelegramNotification(
        { ...config, locale: testCase.locale },
        { title: 'T-2026-0007', body: 'urgent · Lift 2' },
        'https://stoerdesk.local/pwa',
        fetchMock as unknown as typeof fetch,
      )

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const payload = JSON.parse(String(init.body)) as { text: string }
      expect(payload.text).toBe(
        `T-2026-0007\nurgent · Lift 2\n\n${testCase.label}: https://stoerdesk.local/pwa`,
      )
    }
  })

  it('keeps the message alone while the PWA url is empty', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await sendTelegramNotification(
      config,
      { title: 'T-2026-0007', body: 'urgent · Lift 2' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { text: string }
    expect(payload.text).toBe('T-2026-0007\nurgent · Lift 2')
  })

  it('refuses to reach the Bot API without a token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

    await expect(
      sendTelegramNotification(
        { ...config, token: '' },
        { title: 'T-2026-0007', body: 'urgent · Lift 2' },
        '',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/bot token/i)

    expect(fetchMock.mock.calls).toEqual([])
  })

  it('reports a rejected response as a TelegramError of the channel', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    try {
      await sendTelegramNotification(
        config,
        { title: 'T-2026-0007', body: 'urgent · Lift 2' },
        '',
        fetchMock as unknown as typeof fetch,
      )
    } catch (error) {
      const telegramError = error as unknown as { name: string; code: string; message: string }
      expect(telegramError.name).toBe('TelegramError')
      expect(telegramError.code).toBe('http_error')
      expect(telegramError.message).toContain('500')

      return
    }

    expect('the send unexpectedly succeeded').toBe('a rejected response is required')
  })
})
