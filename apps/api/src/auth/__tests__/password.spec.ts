import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '../password'

describe('password hashing (Argon2id)', () => {
  it('writes an Argon2id hash in PHC format with the configured parameters', async () => {
    const hash = await hashPassword('bootstrap-password-1')

    expect(hash.startsWith('$argon2id$v=19$')).toBe(true)
    // The library writes the parameter block as m,p,t — checked per parameter.
    for (const parameter of ['m=65536', 'p=4', 't=3']) {
      expect(hash).toContain(parameter)
    }
  })

  it('never stores the plain password', async () => {
    const plain = 'bootstrap-password-2'
    const hash = await hashPassword(plain)

    expect(hash).not.toContain(plain)
  })

  it('salts every hash, so the same password produces different hashes', async () => {
    const [first, second] = await Promise.all([
      hashPassword('bootstrap-password-3'),
      hashPassword('bootstrap-password-3'),
    ])

    expect(first).not.toBe(second)
    await expect(verifyPassword(first, 'bootstrap-password-3')).resolves.toBe(true)
    await expect(verifyPassword(second, 'bootstrap-password-3')).resolves.toBe(true)
  })

  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('bootstrap-password-4')

    await expect(verifyPassword(hash, 'bootstrap-password-4')).resolves.toBe(true)
    await expect(verifyPassword(hash, 'bootstrap-password-5')).resolves.toBe(false)
  })

  it('reports false for a broken or empty stored hash instead of throwing', async () => {
    await expect(verifyPassword('', 'anything')).resolves.toBe(false)
    await expect(verifyPassword('$argon2id$not-a-hash', 'anything')).resolves.toBe(false)
    await expect(verifyPassword('garbage', 'anything')).resolves.toBe(false)
  })
})
