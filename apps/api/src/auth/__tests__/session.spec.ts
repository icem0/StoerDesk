import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import {
  SESSION_COOKIE_NAME,
  generateSessionToken,
  hashSessionToken,
  sessionCookieOptions,
} from '../session'

const env = loadEnv({ NODE_ENV: 'test', COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'strict' })

describe('session token and cookie (unit)', () => {
  it('creates 256 bit base64url tokens that never repeat', () => {
    const first = generateSessionToken()
    const second = generateSessionToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first).not.toBe(second)
    expect(hashSessionToken(first)).not.toBe(hashSessionToken(second))
  })

  it('hashes the token to stable lower case hex and never returns the token itself', () => {
    const token = 'a-fixed-session-token'
    const expected = createHash('sha256').update(token, 'utf8').digest('hex')

    expect(hashSessionToken(token)).toBe(expected)
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSessionToken(token)).not.toContain(token)
  })

  it('uses the cookie attributes of the environment and always sets httpOnly', () => {
    const options = sessionCookieOptions(env, new Date(Date.now() + 60 * 60 * 1000))

    expect(SESSION_COOKIE_NAME).toBe('session')
    expect(options.httpOnly).toBe(true)
    expect(options.secure).toBe(true)
    expect(options.sameSite).toBe('strict')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBeGreaterThan(3500)
    expect(options.maxAge).toBeLessThanOrEqual(3600)
  })

  it('never reports a negative lifetime for an already expired session', () => {
    const options = sessionCookieOptions(env, new Date(Date.now() - 60 * 1000))

    expect(options.maxAge).toBe(0)
  })
})
