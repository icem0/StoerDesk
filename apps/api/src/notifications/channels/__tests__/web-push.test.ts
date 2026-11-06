import { describe, expect, it, vi } from 'vitest'

import * as webPush from 'web-push'
import { sendWebPushNotification } from '../web-push'

describe('sendWebPushNotification', () => {
  const message = { title: 'T-2026-0007', body: 'urgent · Lift 2' }

  const vapidKeys = {
    publicKey: 'BPm1NEFHt4bH8m8mV0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ',
    privateKey: 'fMy7mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ',
    subject: 'mailto:admin@example.org',
  }

  const subscription = {
    endpoint: 'https://push.example.org/secret/42',
    p256dh: 'BPm1p256dh',
    auth: 'authSecret42',
  }

  it('sends the payload text and the VAPID details to one subscription', async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

    await sendWebPushNotification(
      vapidKeys,
      message,
      'https://stoerdesk.local/pwa',
      [subscription],
      sendMock as unknown as typeof webPush.sendNotification,
    )

    expect(sendMock).toHaveBeenCalledTimes(1)

    const [subscriptionArg, payload, options] =
      sendMock.mock.calls[0] as unknown as [
        { endpoint: string; keys: Record<string, string> },
        string,
        { vapidDetails: Record<string, string> },
      ]

    expect(subscriptionArg.endpoint).toBe('https://push.example.org/secret/42')
    expect(subscriptionArg.keys).toEqual({ p256dh: 'BPm1p256dh', auth: 'authSecret42' })
    expect(payload).toBe('T-2026-0007\nurgent · Lift 2\n\nÖffnen: https://stoerdesk.local/pwa')
    expect(options.vapidDetails).toEqual(vapidKeys)
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

      await sendWebPushNotification(
        { ...vapidKeys, locale: testCase.locale },
        message,
        'https://stoerdesk.local/pwa',
        [subscription],
        sendMock as unknown as typeof webPush.sendNotification,
      )

      const [, payload] = sendMock.mock.calls[0] as unknown as [Record<string, unknown>, string]
      expect(payload).toBe(
        `T-2026-0007\nurgent · Lift 2\n\n${testCase.label}: https://stoerdesk.local/pwa`,
      )
    }
  })

  it('keeps the message alone while the PWA url is empty', async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

    await sendWebPushNotification(
      vapidKeys,
      message,
      '',
      [subscription],
      sendMock as unknown as typeof webPush.sendNotification,
    )

    const [, payload] = sendMock.mock.calls[0] as unknown as [Record<string, unknown>, string]
    expect(payload).toBe('T-2026-0007\nurgent · Lift 2')
  })

  it('sends once per subscription', async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

    await sendWebPushNotification(
      vapidKeys,
      message,
      '',
      [subscription, { ...subscription, endpoint: 'https://push.other.org/secret/7' }],
      sendMock as unknown as typeof webPush.sendNotification,
    )

    expect(sendMock).toHaveBeenCalledTimes(2)

    const endpoints = sendMock.mock.calls.map(
      (call) => (call as unknown as [{ endpoint: string }])[0].endpoint,
    )
    expect(endpoints).toEqual([
      'https://push.example.org/secret/42',
      'https://push.other.org/secret/7',
    ])
  })

  it('refuses to reach a push service without VAPID keys', async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

    for (const key of ['publicKey', 'privateKey', 'subject']) {
      await expect(
        sendWebPushNotification(
          { ...vapidKeys, [key]: '' },
          message,
          '',
          [subscription],
          sendMock as unknown as typeof webPush.sendNotification,
        ),
      ).rejects.toThrow(/VAPID keys/i)
    }

    expect(sendMock.mock.calls).toEqual([])
  })

  it('sends nothing while nobody subscribed', async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))

    await sendWebPushNotification(
      vapidKeys,
      message,
      'https://stoerdesk.local/pwa',
      [],
      sendMock as unknown as typeof webPush.sendNotification,
    )

    expect(sendMock.mock.calls).toEqual([])
  })

  it('reports a rejected push endpoint as a WebPushError of the channel', async () => {
    const sendMock = vi.fn(() => {
      throw new webPush.WebPushError('Received unexpected response code', 404, {}, '', 'x')
    })

    try {
      await sendWebPushNotification(
        vapidKeys,
        message,
        '',
        [subscription],
        sendMock as unknown as typeof webPush.sendNotification,
      )
    } catch (error) {
      const webPushError = error as unknown as { name: string; code: string; message: string }
      expect(webPushError.name).toBe('WebPushError')
      expect(webPushError.code).toBe('send_failed')
      expect(webPushError.message).toContain('404')

      return
    }

    expect('the send unexpectedly succeeded').toBe('a rejected endpoint is required')
  })

  it('names a transport failure without a status code', async () => {
    const sendMock = vi.fn(async () => {
      throw new Error('socket hang up')
    })

    try {
      await sendWebPushNotification(
        vapidKeys,
        message,
        '',
        [subscription],
        sendMock as unknown as typeof webPush.sendNotification,
      )
    } catch (error) {
      const webPushError = error as unknown as { name: string; code: string; message: string }
      expect(webPushError.name).toBe('WebPushError')
      expect(webPushError.code).toBe('send_failed')
      expect(webPushError.message).toBe('The push service send failed')

      return
    }

    expect('the send unexpectedly succeeded').toBe('a failing transport is required')
  })
})
