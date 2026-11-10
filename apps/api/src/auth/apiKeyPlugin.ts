import fp from 'fastify-plugin'

import type { Database } from '../db/client'
import { verifyApiKey, type VerifiedApiKey } from './api-keys'
import { requireScopeOrPermission } from './requirePermission'

/**
 * Bearer API-key authentication (`specs/08-objects-api.md` §9.5, ADR-0013,
 * WP-M10-05). The hook only reads `Authorization`; the session plugin owns the
 * cookie. A malformed, revoked or expired key answers `401 api_key_invalid`.
 * The header and the token never reach a log.
 */

export type ApiKeyContext = VerifiedApiKey

type ApiKeyOptions = {
  database: Database['database']
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the API-key hook for a valid bearer request. */
    apiKey?: ApiKeyContext
  }
}

const BEARER = 'Bearer '

export const apiKeyPlugin = fp<ApiKeyOptions>(
  async (app, { database }) => {
    app.addHook('onRequest', async (request, reply) => {
      const header = request.headers.authorization

      if (header === undefined) {
        return
      }

      if (!header.startsWith(BEARER)) {
        await reply.code(401).send({ code: 'api_key_invalid', params: {} })

        return
      }

      const token = header.slice(BEARER.length).trim()
      const verified = token === '' ? undefined : await verifyApiKey(database, token)

      if (verified === undefined) {
        await reply.code(401).send({ code: 'api_key_invalid', params: {} })

        return
      }

      request.apiKey = verified
    })
  },
  { name: 'stoerdesk-api-key' },
)

/** Probe routes for the dual guard, registered only when `NODE_ENV=test` (§3.7). */
export const apiKeyProbeRoutes = fp<ApiKeyOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/_test/api-key/objects',
      { preHandler: requireScopeOrPermission(database, 'objects:read', 'object.read') },
      async () => ({ allowed: true }),
    )

    app.get(
      '/api/v1/_test/api-key/tickets',
      { preHandler: requireScopeOrPermission(database, 'tickets:read', 'ticket.read') },
      async () => ({ allowed: true }),
    )
  },
  { name: 'stoerdesk-api-key-probe' },
)
