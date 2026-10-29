import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { loginRequestSchema, meResponseSchema } from '@stoerdesk/shared'

import { users } from '../db/schema'
import { verifyPassword } from './password'
import {
  createSession,
  destroySession,
  loadUserRoleKeys,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session'
import type { AuthPluginOptions } from './sessionPlugin'
import { requireUser } from './sessionPlugin'

/** Login attempts per minute and IP (`PLAN.md` §15, `specs/01-rbac.md` §3.6). */
const LOGIN_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const

/**
 * Real Argon2id hash of a throw-away value. A login for an unknown e-mail verifies
 * against it, so the response time does not tell whether the account exists — the
 * status code already does not.
 */
const DECOY_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$unzo0GQ7sK3GbZK+7Cav5g$0U9hoGjgtOcnK1NfNTJPT9Iv9Etv3EcqNf78npyaXZk'

/**
 * Login, logout and `me` (`specs/01-rbac.md` §3.6). Errors are always
 * `{ code, params }`; the session cookie is the only credential and never carries
 * a user id.
 */
export const authRoutes: FastifyPluginAsync<AuthPluginOptions> = async (app, { database, env }) => {
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = loginRequestSchema.safeParse(request.body)

      if (!parsed.success) {
        return reply.code(400).send({
          code: 'invalid_request',
          params: { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
        })
      }

      const { email, password } = parsed.data

      const [account] = await database
        .select({
          id: users.id,
          email: users.email,
          locale: users.locale,
          passwordHash: users.passwordHash,
          active: users.active,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)

      // One 401 for unknown account, wrong password and deactivated account.
      const passwordMatches = await verifyPassword(account?.passwordHash ?? DECOY_HASH, password)

      if (account === undefined || account.active !== true || passwordMatches !== true) {
        // No e-mail in the log line: a failed login is PII, only the code is logged.
        request.log.warn({ code: 'login_failed' })

        return reply.code(401).send({ code: 'invalid_credentials', params: {} })
      }

      const session = await createSession(database, account.id, env.SESSION_TTL_HOURS)

      reply.setCookie(
        SESSION_COOKIE_NAME,
        session.token,
        sessionCookieOptions(env, session.expiresAt),
      )

      const roles = await loadUserRoleKeys(database, account.id)

      return reply.code(200).send(
        meResponseSchema.parse({
          user: { id: account.id, email: account.email, locale: account.locale, roles },
        }),
      )
    },
  )

  app.post('/api/v1/auth/logout', async (request, reply) => {
    await destroySession(database, request.cookies[SESSION_COOKIE_NAME] ?? '')

    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: env.COOKIE_SAME_SITE,
      secure: env.COOKIE_SECURE,
    })

    return reply.code(204).send()
  })

  app.get('/api/v1/me', { preHandler: [requireUser] }, async (request) =>
    meResponseSchema.parse({ user: request.user }),
  )
}
