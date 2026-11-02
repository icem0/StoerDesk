import { createChallenge, verifySolution } from 'altcha-lib'
import type { Challenge, Payload } from 'altcha-lib/types'
import fp from 'fastify-plugin'

/**
 * Altcha proof-of-work primitives of the public report path
 * (`specs/06-report-form.md` §7.6, WP-M2-07b).
 *
 * A captcha is only ever asked for a **suspicious** report — WP-M2-07 counts the
 * reports per IP and per QR token, WP-M2-07c decides — so this module only issues a
 * SHA-256 proof of work and verifies the solved payload: no API key, no third-party
 * reputation check, no invisible mode. `altcha-lib` is held on its **v1 challenge
 * format** (`{ algorithm, challenge, salt, signature, maxnumber }`): that is the
 * format the `altcha` web component of the form answers with and the one the
 * `tickets.suspected_spam` decision of WP-M2-07c validates.
 *
 * Challenges carry an expiry inside their `salt`: without it a single solved payload
 * could be replayed for every later report of that IP or token.
 */

/** Same envelope as the report route (`PLAN.md` §3): code plus params, never text. */
class AltchaRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'AltchaRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/** The challenge the client receives — the object `altcha-lib` v1 creates. */
export type AltchaChallenge = Challenge

/** The solved payload: the challenge fields plus the counter the client found. */
export type AltchaPayload = Payload & { maxnumber?: number; took?: number }

/** A solved payload stays usable for this long — as long as the suspicion window. */
export const ALTCHA_CHALLENGE_TTL_MS = 10 * 60 * 1000

/** Issues one SHA-256 proof of work signed with `secret`; `maxNumber` is its difficulty. */
export async function createAltchaChallenge(
  secret: string,
  maxNumber: number,
  ttlMs = ALTCHA_CHALLENGE_TTL_MS,
): Promise<AltchaChallenge> {
  return createChallenge({
    algorithm: 'SHA-256',
    hmacKey: secret,
    maxnumber: maxNumber,
    expires: new Date(Date.now() + ttlMs),
  })
}

/**
 * Recomputes the challenge hash from `salt + number` and the HMAC signature of that
 * hash with `secret`, and rejects an expired challenge (`specs/06-report-form.md`
 * §7.6). Never throws for a malformed payload — the caller only sees `true`/`false`.
 */
export async function verifyAltchaPayload(payload: AltchaPayload, secret: string): Promise<boolean> {
  try {
    return await verifySolution({ ...payload }, secret)
  } catch {
    return false
  }
}

export type PublicAltchaRouteOptions = {
  secret: string
  maxNumber: number
}

export const publicAltchaRoutes = fp<PublicAltchaRouteOptions>(
  async (app, { secret, maxNumber }) => {
    // Unauthenticated like every public route; the captcha is only fetched after the
    // server answered `400 captcha_required` (WP-M2-07d), never before.
    app.post('/api/v1/public/altcha/challenge', async (_request, reply) => {
      if (secret === '') {
        // Not configured: the form never shows a widget, WP-M2-07c stores a
        // suspicious report with `suspected_spam` instead of asking for one.
        throw new AltchaRouteError(404, 'altcha_not_configured', {})
      }

      return reply.code(200).send(await createAltchaChallenge(secret, maxNumber))
    })
  },
  { name: 'public-altcha-routes' },
)
