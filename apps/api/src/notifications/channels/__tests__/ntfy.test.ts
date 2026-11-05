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

    const payload = JSON.parse(String(init.body)) as {
      title: string
      message: string
      actions: { action: string; label: string; uri: string }[]
    }
    expect(payload.title).toBe('New ticket')
    expect(payload.message).toBe('Lift 2 is broken')
    expect(payload.actions).toEqual([
      { action: 'view', label: 'Öffnen', uri: 'https://stoerdesk.local/pwa' },
    ])
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
