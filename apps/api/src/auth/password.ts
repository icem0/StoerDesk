import { argon2id, hash, verify } from 'argon2'
import { randomInt } from 'node:crypto'

/**
 * Argon2id is the hashing algorithm fixed in `PLAN.md` §4. The parameters are the
 * library defaults (65536 KiB memory, 3 iterations, parallelism 4); they are kept
 * explicit here so a later parameter change is a visible decision and so that
 * `verify` can still read hashes written by older builds (the encoded string
 * carries its own parameters).
 */
export const PASSWORD_HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const

/** Argon2id hash in PHC format (`$argon2id$v=19$m=…,p=…,t=…$salt$hash`). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, PASSWORD_HASH_OPTIONS)
}

/**
 * Constant-time comparison of a stored hash and a candidate password.
 *
 * A malformed, truncated or empty stored hash never throws: it simply does not
 * verify, so the caller keeps a single `401` path (WP-M1-07) instead of having to
 * distinguish library errors from wrong credentials.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (storedHash === '') {
    return false
  }

  try {
    return await verify(storedHash, plain)
  } catch {
    return false
  }
}

/**
 * The alphabet of the one-time password (`specs/01-rbac.md` §3.9, ADR-0031).
 *
 * The password is read aloud, copied and typed by hand, so it carries no
 * character that looks like another one: no `O` beside `0`, no `I` beside `l`
 * beside `1`. The alphabet has 55 characters, 20 of them make more than 108 bits
 * of entropy.
 */
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** The length of the one-time password (20 characters). */
export const TEMPORARY_PASSWORD_LENGTH = 20

/**
 * The one-time password of the administration (`specs/01-rbac.md` §3.9,
 * ADR-0031): the server generates it, so the office knows no secret of the
 * colleague. `randomInt` draws every character of the alphabet with the same
 * probability — no modulo bias.
 */
export function generateTemporaryPassword(): string {
  let password = ''

  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]
  }

  return password
}
