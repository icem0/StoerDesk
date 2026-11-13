import { describe, expect, it, vi } from 'vitest'

import { sendWhatsAppNotification } from '../whatsapp'

describe('sendWhatsAppNotification', () => {
  const config = { baseUrl: 'https://bridge.example.org', chatId: 'chat-7', token: 'bridge-bearer-secret' }

  it('posts chatId and text to the bridge with the bearer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }))

    await sendWhatsAppNotification(
      config,
      { title: 'T-2026-0007', body: 'urgent · Lift 2' },
      'https://stoerdesk.local/pwa',
      fetchMock as unknown as typeof fetch,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://bridge.example.org/messages')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers.authorization).toBe('Bearer bridge-bearer-secret')

    const payload = JSON.parse(String(init.body)) as { chatId: string; text: string }
    expect(payload.chatId).toBe('chat-7')
    expect(payload.text).toBe('T-2026-0007\nurgent · Lift 2\n\nÖffnen: https://stoerdesk.local/pwa')
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

      await sendWhatsAppNotification(
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
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }))

    await sendWhatsAppNotification(
      config,
      { title: 'T-2026-0007', body: 'urgent · Lift 2' },
      '',
      fetchMock as unknown as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { text: string }
    expect(payload.text).toBe('T-2026-0007\nurgent · Lift 2')
  })

  it('accepts 200 and 202 as success', async () => {
    for (const status of [200, 202]) {
      const fetchMock = vi.fn(async () => new Response('{}', { status }))

      await sendWhatsAppNotification(
        config,
        { title: 'T-2026-0007', body: 'urgent · Lift 2' },
        '',
        fetchMock as unknown as typeof fetch,
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('refuses to reach the bridge without a bearer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }))

    await expect(
      sendWhatsAppNotification(
        { ...config, token: '' },
        { title: 'T-2026-0007', body: 'urgent · Lift 2' },
        '',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/bearer/i)

    expect(fetchMock.mock.calls).toEqual([])
  })

  it('reports a rejected answer as a WhatsAppError of the channel', async () => {
    for (const status of [500, 404, 204]) {
      const fetchMock = vi.fn(async () => new Response(status === 204 ? null : 'nope', { status }))

      try {
        await sendWhatsAppNotification(
          config,
          { title: 'T-2026-0007', body: 'urgent · Lift 2' },
          '',
          fetchMock as unknown as typeof fetch,
        )
      } catch (error) {
        const whatsappError = error as unknown as { name: string; code: string; message: string }
        expect(whatsappError.name).toBe('WhatsAppError')
        expect(whatsappError.code).toBe('http_error')
        expect(whatsappError.message).toContain(String(status))
        expect(whatsappError.message.includes('bridge-bearer-secret')).toBe(false)

        continue
      }

      expect('the send unexpectedly succeeded').toBe(`a ${status} answer is required`)
    }
  })
})
