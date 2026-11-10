import { solveChallenge } from 'altcha-lib/v1'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALTCHA_CHALLENGE_TTL_MS,
  createAltchaChallenge,
  publicAltchaRoutes,
  verifyAltchaPayload,
  type AltchaChallenge,
  type AltchaPayload,
} from '../altcha'

/**
 * Unit test of the Altcha primitives of `specs/06-report-form.md` §7.6 (WP-M2-07b):
 * a challenge is created, solved with the library's own solver and verified again —
 * and every tampering (signature, counter, secret, expiry) is refused. No database,
 * no report route: the create path is WP-M2-07c.
 */

const SECRET = 'test-altcha-secret-never-a-real-one'
const MAX_NUMBER = 2000

type Envelope = { code?: string; params?: Record<string, unknown> }

async function solve(challenge: AltchaChallenge) {
  const { promise } = solveChallenge(
    challenge.challenge,
    challenge.salt,
    challenge.algorithm,
    challenge.maxnumber,
  )
  const solution = await promise

  if (solution === null) {
    throw new Error('the proof of work was not solved')
  }

  const payload: AltchaPayload = {
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    salt: challenge.salt,
    signature: challenge.signature,
    maxnumber: challenge.maxnumber,
    number: solution.number,
    took: solution.took,
  }

  return payload
}

function buildApp(secret: string, maxNumber = MAX_NUMBER): FastifyInstance {
  const app = Fastify({ logger: false })

  // Same envelope as `buildServer`: `{ code, params }`, never translated text.
  app.setErrorHandler((error, _request, reply) => {
    const envelope = error as Error & {
      statusCode?: number
      code?: string
      params?: Record<string, unknown>
    }

    return reply
      .code(envelope.statusCode ?? 500)
      .send({ code: envelope.code, params: envelope.params ?? {} })
  })

  void app.register(publicAltchaRoutes, { secret, maxNumber })

  return app
}

describe('altcha challenge primitives', () => {
  let solved: AltchaPayload

  beforeAll(async () => {
    solved = await solve(await createAltchaChallenge(SECRET, MAX_NUMBER))
  })

  it('verifies the payload of a solved challenge', async () => {
    expect(solved.number).toBeGreaterThanOrEqual(0)
    expect(solved.number).toBeLessThan(MAX_NUMBER)
    await expect(verifyAltchaPayload(solved, SECRET)).resolves.toBe(true)
  })

  it('refuses a tampered signature, challenge, counter and secret', async () => {
    await expect(
      verifyAltchaPayload({ ...solved, signature: '0'.repeat(64) }, SECRET),
    ).resolves.toBe(false)
    await expect(
      verifyAltchaPayload({ ...solved, challenge: '0'.repeat(64) }, SECRET),
    ).resolves.toBe(false)
    await expect(verifyAltchaPayload({ ...solved, number: solved.number + 1 }, SECRET)).resolves.toBe(
      false,
    )
    await expect(verifyAltchaPayload(solved, 'another-secret-entirely')).resolves.toBe(false)
  })

  it('refuses a payload whose challenge already expired', async () => {
    const expired = await solve(
      await createAltchaChallenge(SECRET, MAX_NUMBER, -ALTCHA_CHALLENGE_TTL_MS),
    )

    await expect(verifyAltchaPayload(expired, SECRET)).resolves.toBe(false)
  })
})

describe('public altcha challenge route', () => {
  let configured: FastifyInstance
  let unconfigured: FastifyInstance

  beforeAll(async () => {
    configured = buildApp(SECRET)
    unconfigured = buildApp('')
    await configured.ready()
    await unconfigured.ready()
  })

  afterAll(async () => {
    await configured.close()
    await unconfigured.close()
  })

  it('answers the challenge the form solves', async () => {
    const response = await configured.inject({ method: 'POST', url: '/api/v1/public/altcha/challenge' })
    const body = response.json() as Record<string, unknown>

    expect(response.statusCode).toBe(200)
    expect(body.algorithm).toBe('SHA-256')
    expect(body.salt).toEqual(expect.any(String))
    expect(body.challenge).toEqual(expect.any(String))
    expect(body.signature).toEqual(expect.any(String))
    expect(body.maxnumber).toBe(MAX_NUMBER)

    const payload = await solve(body as unknown as AltchaChallenge)

    await expect(verifyAltchaPayload(payload, SECRET)).resolves.toBe(true)
  })

  it('answers 404 altcha_not_configured without a secret', async () => {
    const response = await unconfigured.inject({ method: 'POST', url: '/api/v1/public/altcha/challenge' })

    expect(response.statusCode).toBe(404)
    expect(response.json<Envelope>().code).toBe('altcha_not_configured')
  })
})
