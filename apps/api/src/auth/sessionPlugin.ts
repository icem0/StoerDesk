import type { preHandlerHookHandler } from 'fastify'
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
  locale: string
  roles: string[]
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

/** Guard for authenticated routes: `401` with an error code, never a message. */
export const requireUser: preHandlerHookHandler = async (request, reply) => {
  if (request.user === undefined) {
    return reply.code(401).send({ code: 'session_invalid', params: {} })
  }
}
