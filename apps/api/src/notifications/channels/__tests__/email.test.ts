import { describe, expect, it, vi } from 'vitest'

import { createTransport } from 'nodemailer'
import { sendEmailNotification } from '../email'

describe('sendEmailNotification', () => {
  const message = { title: 'T-2026-0007', body: 'urgent · Lift 2' }

  const mailServer = {
    host: 'mail.example.org',
    port: 587,
    secure: false,
    user: 'stoerdesk',
    password: 'hunter2',
    from: 'stoerdesk@example.org',
  }

  it('sends the notification over the SMTP transport of the environment', async () => {
    const sendMail = vi.fn(async () => ({}))
    const factory = vi.fn(() => ({ sendMail }))

    await sendEmailNotification(
      mailServer,
      message,
      'https://stoerdesk.local/pwa',
      factory as unknown as typeof createTransport,
    )

    expect(factory).toHaveBeenCalled()

    const [options] = factory.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(options.host).toBe('mail.example.org')
    expect(options.port).toBe(587)
    expect(options.secure).toBe(false)
    expect(options.auth).toEqual({ user: 'stoerdesk', pass: 'hunter2' })

    expect(sendMail).toHaveBeenCalledTimes(1)

    const [mail] = sendMail.mock.calls[0] as unknown as [Record<string, string>]
    expect(mail.from).toBe('stoerdesk@example.org')
    expect(mail.subject).toBe('T-2026-0007')
    expect(mail.text).toBe('urgent · Lift 2\n\nÖffnen: https://stoerdesk.local/pwa')
  })

  it('opens a TLS connection when the environment asks for it', async () => {
    const factory = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))

    await sendEmailNotification(
      { ...mailServer, port: 465, secure: true },
      message,
      '',
      factory as unknown as typeof createTransport,
    )

    const [options] = factory.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(options.port).toBe(465)
    expect(options.secure).toBe(true)
  })

  it('omits the auth block for a mail server without login', async () => {
    const factory = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))

    await sendEmailNotification(
      { ...mailServer, user: '', password: '' },
      message,
      '',
      factory as unknown as typeof createTransport,
    )

    const [options] = factory.mock.calls[0] as unknown as [Record<string, unknown>]
    expect('auth' in options).toBe(false)
  })

  it('labels the deep link in the configured locale (WP-M7-04b)', async () => {
    const cases: { locale: 'de' | 'en'; label: string }[] = [
      { locale: 'de', label: 'Öffnen' },
      { locale: 'en', label: 'Open' },
    ]

    for (const testCase of cases) {
      const sendMail = vi.fn(async () => ({}))
      const factory = vi.fn(() => ({ sendMail }))

      await sendEmailNotification(
        { ...mailServer, locale: testCase.locale },
        message,
        'https://stoerdesk.local/pwa',
        factory as unknown as typeof createTransport,
      )

      const [mail] = sendMail.mock.calls[0] as unknown as [Record<string, string>]
      expect(mail.text).toBe(`urgent · Lift 2\n\n${testCase.label}: https://stoerdesk.local/pwa`)
    }
  })

  it('keeps the body alone while the PWA url is empty', async () => {
    const sendMail = vi.fn(async () => ({}))
    const factory = vi.fn(() => ({ sendMail }))

    await sendEmailNotification(
      mailServer,
      message,
      '',
      factory as unknown as typeof createTransport,
    )

    const [mail] = sendMail.mock.calls[0] as unknown as [Record<string, string>]
    expect(mail.text).toBe('urgent · Lift 2')
  })

  it('refuses to sign a mail without a sender address', async () => {
    const factory = vi.fn(() => ({ sendMail: vi.fn(async () => ({})) }))

    await expect(
      sendEmailNotification(
        { ...mailServer, from: '' },
        message,
        '',
        factory as unknown as typeof createTransport,
      ),
    ).rejects.toThrow(/sender address/i)

    expect(factory.mock.calls).toEqual([])
  })

  it('reports a failing send as an EmailError of the channel', async () => {
    const factory = vi.fn(() => ({
      sendMail: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED mail.example.org:587')
      }),
    }))

    try {
      await sendEmailNotification(
        mailServer,
        message,
        '',
        factory as unknown as typeof createTransport,
      )
    } catch (error) {
      const emailError = error as unknown as { name: string; code: string; message: string }
      expect(emailError.name).toBe('EmailError')
      expect(emailError.code).toBe('send_failed')
      expect(emailError.message).toContain('ECONNREFUSED')

      return
    }

    expect('the send unexpectedly succeeded').toBe('a failing send is required')
  })
})
