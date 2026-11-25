import { describe, expect, it } from 'vitest'

import { loadEnv } from '../../../config/env'
import type { EmailChannelConfiguration } from '../../config'
import { configuredChannels, emailEnvironment } from '../index'

/**
 * The registry of the channels with the saved configuration of the e-mail
 * channel (`specs/10-notifications.md` §11.2, ADR-0046, WP-M41-01): the row of
 * the administration wins over the environment of the SMTP keys, so a mailbox
 * that the office configured in the administration is a channel of the instance
 * — even while the environment of the installation carries no SMTP key at all.
 */

const mailbox = (values: Partial<EmailChannelConfiguration> = {}): EmailChannelConfiguration => ({
  config: {
    host: 'smtp.office365.com',
    port: '587',
    secure: 'false',
    user: 'office@example.invalid',
    from: 'office@example.invalid',
  },
  secret: 'app-password',
  enabled: true,
  usable: true,
  ...values,
})

const names = (env: ReturnType<typeof loadEnv>): string[] =>
  configuredChannels(env).map((channel) => channel.name)

describe('emailEnvironment (the environment with the saved configuration of the e-mail channel)', () => {
  it('counts a mailbox of the administration although the environment has no SMTP key', () => {
    const effective = emailEnvironment(loadEnv({}), mailbox())

    expect(effective.SMTP_HOST).toBe('smtp.office365.com')
    expect(effective.SMTP_FROM).toBe('office@example.invalid')
    expect(effective.SMTP_PORT).toBe(587)
    expect(effective.SMTP_SECURE).toBe(false)
    expect(effective.SMTP_USER).toBe('office@example.invalid')
    expect(effective.SMTP_PASSWORD).toBe('app-password')
    expect(names(effective)).toContain('email')
  })

  it('keeps a channel that the administration switched off out of the registry', () => {
    const effective = emailEnvironment(loadEnv({}), mailbox({ enabled: false }))

    expect(effective.SMTP_HOST).toBe('')
    expect(effective.SMTP_FROM).toBe('')
    expect(names(effective)).not.toContain('email')
  })

  it('leaves the environment alone without a saved configuration', () => {
    const env = loadEnv({ SMTP_HOST: 'smtp.env', SMTP_FROM: 'from@env' })

    expect(emailEnvironment(env, undefined)).toBe(env)
    expect(names(env)).toContain('email')
  })

  it('falls back to the port of the environment for a port that is no number', () => {
    const effective = emailEnvironment(
      loadEnv({ SMTP_PORT: '465' }),
      mailbox({ config: { host: 'smtp.office365.com', port: 'no-number', from: 'office@example.invalid' } }),
    )

    expect(effective.SMTP_PORT).toBe(465)
  })
})
