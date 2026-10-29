import { describe, expect, it } from 'vitest'

import { databaseConnectionUrl, loadEnv } from '../env'

describe('databaseConnectionUrl', () => {
  it('uses DATABASE_URL when no host is configured', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://user:secret@localhost:5432/app' })

    expect(databaseConnectionUrl(env)).toBe('postgres://user:secret@localhost:5432/app')
  })

  it('builds the URL from the parts and encodes the credentials', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://ignored:ignored@localhost:5432/ignored',
      DATABASE_HOST: 'db',
      DATABASE_PORT: '5432',
      DATABASE_NAME: 'stoerdesk',
      DATABASE_USER: 'stoerdesk',
      DATABASE_PASSWORD: '50cKaJ5b#dbeO9QTB!SYxeTA8ELxOV',
    })

    const url = databaseConnectionUrl(env)

    expect(url).toBe('postgres://stoerdesk:50cKaJ5b%23dbeO9QTB%21SYxeTA8ELxOV@db:5432/stoerdesk')
    expect(() => new URL(url)).not.toThrow()
  })

  it('omits the password when it is empty', () => {
    const env = loadEnv({
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'stoerdesk',
      DATABASE_USER: 'stoerdesk',
      DATABASE_PASSWORD: '',
    })

    expect(databaseConnectionUrl(env)).toBe('postgres://stoerdesk@db:5432/stoerdesk')
  })
})

describe('bootstrap administrator seed contract', () => {
  it('accepts an empty seed pair', () => {
    expect(() => loadEnv({ SEED_ADMIN_EMAIL: '', SEED_ADMIN_PASSWORD: '' })).not.toThrow()
  })

  it('requires both seed values together', () => {
    expect(() => loadEnv({ SEED_ADMIN_PASSWORD: 'a-long-enough-password' })).toThrow(
      /SEED_ADMIN_EMAIL is required/,
    )
    expect(() => loadEnv({ SEED_ADMIN_EMAIL: 'admin@example.org' })).toThrow(
      /SEED_ADMIN_PASSWORD is required/,
    )
  })

  it('rejects a malformed e-mail address', () => {
    expect(() =>
      loadEnv({
        SEED_ADMIN_EMAIL: 'not-an-email',
        SEED_ADMIN_PASSWORD: 'a-long-enough-password',
      }),
    ).toThrow(/SEED_ADMIN_EMAIL must be a valid e-mail address/)
  })

  it('rejects a seed password shorter than 12 characters', () => {
    expect(() =>
      loadEnv({ SEED_ADMIN_EMAIL: 'admin@example.org', SEED_ADMIN_PASSWORD: 'short12' }),
    ).toThrow(/SEED_ADMIN_PASSWORD must be at least 12 characters/)
  })

  it('names the variable in the error but never the seed value', () => {
    const secret = 'unique-seed-value-1'

    try {
      loadEnv({ SEED_ADMIN_EMAIL: 'not-an-email', SEED_ADMIN_PASSWORD: secret })
      expect.unreachable('the seed pair was accepted')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      expect(message).toContain('SEED_ADMIN_EMAIL')
      expect(message).not.toContain(secret)
    }
  })

  it('accepts a complete seed pair', () => {
    expect(() =>
      loadEnv({
        SEED_ADMIN_EMAIL: 'admin@example.org',
        SEED_ADMIN_PASSWORD: 'a-long-enough-password',
      }),
    ).not.toThrow()
  })
})
