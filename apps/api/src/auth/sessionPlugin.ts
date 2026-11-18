import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import fp from 'fastify-plugin'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { loadSession, loadUserRoleKeys, SESSION_COOKIE_NAME } from './session'

/**
 * Session plugin of `specs/01-rbac.md` §3.6.
 *
 * `fastify-plugin` keeps the hook out of an encapsulated scope, so `request.user`
 * is available for every route that comes later (tickets, objects, admin). Session
 * and role data are read per request: a role change or a deactivation takes effect
 * without a new login.
 */

export type AuthUser = {
  id: string
  email: string
  givenName: string
  familyName: string
  locale: string
  theme: string
  roles: string[]
  /**
   * The flag of an open password change (`specs/01-rbac.md` §3.9, ADR-0031):
   * `true` while the password of the account is a one-time password.
   */
  mustChangePassword: boolean
}

export type AuthPluginOptions = {
  database: Database['database']
  env: Env
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook, undefined for anonymous requests. */
    user?: AuthUser
  }

  interface FastifyContextConfig {
    /**
     * The route stays reachable while the account carries an open password
     * change (`specs/01-rbac.md` §3.9): `GET /api/v1/me` and
     * `PATCH /api/v1/users/me` are the two exemptions of the block.
     */
    allowPendingPasswordChange?: boolean
  }
}

export const sessionPlugin = fp<AuthPluginOptions>(
  async (app, { database }) => {
    app.addHook('onRequest', async (request) => {
      const token = request.cookies[SESSION_COOKIE_NAME]

      if (token === undefined || token === '') {
        return
      }

      const user = await loadSession(database, token)

      if (user === undefined) {
        return
      }

      request.user = { ...user, roles: await loadUserRoleKeys(database, user.id) }
    })
  },
  { name: 'stoerdesk-session' },
)

/**
 * The block of an account whose password is a one-time password
 * (`specs/01-rbac.md` §3.9, ADR-0031): the account may log in, but it may not
 * work before the user sets a password of their own. The answer is the code
 * `password_change_required`, never translated text.
 */
export async function rejectPendingPasswordChange(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user?.mustChangePassword !== true) {
    return
  }

  if (request.routeOptions.config.allowPendingPasswordChange === true) {
    return
  }

  await reply.code(403).send({ code: 'password_change_required', params: {} })
}

/** Guard for authenticated routes: `401` with an error code, never a message. */
export const requireUser: preHandlerHookHandler = async (request, reply) => {
  if (request.user === undefined) {
    return reply.code(401).send({ code: 'session_invalid', params: {} })
  }

  await rejectPendingPasswordChange(request, reply)
}
