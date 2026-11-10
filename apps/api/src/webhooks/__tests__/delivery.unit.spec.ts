import { describe, expect, it, vi } from 'vitest'

import {
  deliverWebhook,
  failureOutcome,
  signWebhook,
  webhookEventTypeFor,
  WEBHOOK_DELIVERY_BACKOFF_SECONDS,
} from '../delivery'

describe('webhook delivery', () => {
  it('signs <timestamp>.<body> with HMAC-SHA256', () => {
    expect(signWebhook('whsec_test', '1700000000', '{"a":1}')).toBe(
      '38877139021993b830af32feea6e18a8da83eb2f6e49ee50bd9e4cf4ca4d3789',
    )
  })

  it('maps ticket events to the two subscription types', () => {
    expect(webhookEventTypeFor('created')).toBe('ticket.created')
    expect(webhookEventTypeFor('closed')).toBe('ticket.status_changed')
    expect(webhookEventTypeFor('comment')).toBeUndefined()
    expect(webhookEventTypeFor('paused')).toBeUndefined()
  })

  it('sends the signature and event headers without the secret', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    const body = '{"event":"ticket.created"}'

    const attempt = await deliverWebhook(
      {
        url: 'https://example.org/hook',
        secret: 'whsec_secret',
        eventType: 'ticket.created',
        body,
        timestamp: '1700000000',
      },
      fetchImpl,
    )

    expect(attempt).toEqual({ ok: true, status: 200, durationMs: expect.any(Number) })

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>

    expect(headers['x-stoerdesk-event']).toBe('ticket.created')
    expect(headers['x-stoerdesk-signature']).toBe(
      `t=1700000000,v1=${signWebhook('whsec_secret', '1700000000', body)}`,
    )
    expect(JSON.stringify(init)).not.toContain('whsec_secret')
    expect(init.body).toBe(body)
  })

  it('treats a non-2xx answer as a failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('no', { status: 500 }))

    const attempt = await deliverWebhook(
      {
        url: 'https://example.org/hook',
        secret: 'whsec_secret',
        eventType: 'ticket.status_changed',
        body: '{}',
        timestamp: '1700000000',
      },
      fetchImpl,
    )

    expect(attempt.ok).toBe(false)
    expect(attempt.status).toBe(500)
  })

  it('retries with 1, 5, 25 and 125 seconds and fails on the fifth attempt', () => {
    const now = new Date('2026-11-10T00:00:00.000Z')
    const delays = [1, 2, 3, 4].map((attempt) => {
      const outcome = failureOutcome(attempt, now)

      expect(outcome.status).toBe('PENDING')

      return (outcome.nextAttemptAt.getTime() - now.getTime()) / 1000
    })

    expect(delays).toEqual([...WEBHOOK_DELIVERY_BACKOFF_SECONDS])
    expect(failureOutcome(5, now)).toEqual({ status: 'FAILED', nextAttemptAt: now })
  })
})
