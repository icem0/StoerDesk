import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  apiKeyListResponseSchema,
  createApiKeyRequestSchema,
  createApiKeyResponseSchema,
  PERMISSIONS,
  updateApiKeyRequestSchema,
} from '@stoerdesk/shared'

import {
  ApiKeyError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKey,
} from '../auth/api-keys'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'

/**
 * Admin API-key routes (`specs/08-objects-api.md` §9.5, WP-M10-03). Session-only:
 * an API key can never manage another key.
 */

type Db = Database['database']

type ApiKeyRoutesOptions = {
  database: Db
}

const idSchema = z.uuid()

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function handleError(error: unknown) {
  if (error instanceof ApiKeyError) {
    return { statusCode: error.statusCode, body: { code: error.code, params: error.params } }
  }

  throw error
}

export const adminApiKeyRoutes = fp<ApiKeyRoutesOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/api-keys',
      { preHandler: requirePermission(database, PERMISSIONS.apikey.read) },
      async () => apiKeyListResponseSchema.parse({ keys: await listApiKeys(database) }),
    )

    app.post(
      '/api/v1/api-keys',
      { preHandler: requirePermission(database, PERMISSIONS.apikey.write) },
      async (request, reply) => {
        const parsed = createApiKeyRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          const created = await createApiKey(database, parsed.data, request.user?.id)
          return reply.code(201).send(createApiKeyResponseSchema.parse(created))
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/api-keys/:id',
      { preHandler: requirePermission(database, PERMISSIONS.apikey.write) },
      async (request, reply) => {
        const id = idSchema.safeParse(request.params.id)

        if (!id.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['id'] } })
        }

        const parsed = updateApiKeyRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          return await updateApiKey(database, id.data, parsed.data)
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/api-keys/:id',
      { preHandler: requirePermission(database, PERMISSIONS.apikey.write) },
      async (request, reply) => {
        const id = idSchema.safeParse(request.params.id)

        if (!id.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['id'] } })
        }

        try {
          await revokeApiKey(database, id.data)
          return reply.code(204).send()
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )
  },
  { name: 'stoerdesk-admin-api-keys' },
)
