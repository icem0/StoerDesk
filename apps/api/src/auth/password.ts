import { argon2id, hash, verify } from 'argon2'

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
