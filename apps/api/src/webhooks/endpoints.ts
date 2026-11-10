import { randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  type CreateWebhookRequest,
  type CreateWebhookResponse,
  createWebhookRequestSchema,
  createWebhookResponseSchema,
  PERMISSIONS,
  type UpdateWebhookRequest,
  updateWebhookRequestSchema,
  webhookListResponseSchema,
  webhookSummarySchema,
  type WebhookSummary,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { webhookEndpoints } from '../db/schema'

/**
 * Webhook endpoint service (`specs/08-objects-api.md` §9.5, ADR-0013,
 * WP-M10-09). The secret is generated here, answered once on create and never
 * returned by a list or update route.
 */

type Db = Database['database']

export class WebhookError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'WebhookError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

const SECRET_PREFIX = 'whsec_'

/** `whsec_` plus 32 random bytes in base64url (43 characters). */
export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`
}

type EndpointRow = {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: Date
  updatedAt: Date
}

function summarize(row: EndpointRow): WebhookSummary {
  return webhookSummarySchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

const summarySelection = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  events: webhookEndpoints.events,
  active: webhookEndpoints.active,
  createdAt: webhookEndpoints.createdAt,
  updatedAt: webhookEndpoints.updatedAt,
}

export async function listWebhooks(database: Db): Promise<WebhookSummary[]> {
  const rows = await database
    .select(summarySelection)
    .from(webhookEndpoints)
    .orderBy(desc(webhookEndpoints.createdAt))

  return rows.map(summarize)
}

export async function createWebhook(
  database: Db,
  input: CreateWebhookRequest,
): Promise<CreateWebhookResponse> {
  const secret = generateWebhookSecret()
  const [row] = await database
    .insert(webhookEndpoints)
    .values({
      url: input.url,
      secret,
      events: input.events,
      active: input.active,
    })
    .returning(summarySelection)

  if (row === undefined) {
    throw new WebhookError(500, 'webhook_create_failed')
  }

  return { webhook: summarize(row), secret }
}

export async function updateWebhook(
  database: Db,
  id: string,
  input: UpdateWebhookRequest,
): Promise<WebhookSummary> {
  const patch: Partial<typeof webhookEndpoints.$inferInsert> = { updatedAt: new Date() }

  if (input.url !== undefined) {
    patch.url = input.url
  }

  if (input.events !== undefined) {
    patch.events = input.events
  }

  if (input.active !== undefined) {
    patch.active = input.active
  }

  const [row] = await database
    .update(webhookEndpoints)
    .set(patch)
    .where(eq(webhookEndpoints.id, id))
    .returning(summarySelection)

  if (row === undefined) {
    throw new WebhookError(404, 'webhook_not_found', { id })
  }

  return summarize(row)
}

/** Deletes the endpoint; its delivery history survives with a `NULL` endpoint. */
export async function deleteWebhook(database: Db, id: string): Promise<void> {
  const [row] = await database
    .delete(webhookEndpoints)
    .where(eq(webhookEndpoints.id, id))
    .returning({ id: webhookEndpoints.id })

  if (row === undefined) {
    throw new WebhookError(404, 'webhook_not_found', { id })
  }
}

/**
 * Admin webhook routes (`specs/08-objects-api.md` §9.5, WP-M10-09): session-only
 * and guarded by `settings.read` / `settings.write`. The secret is answered only
 * by the create route.
 */

type WebhookRoutesOptions = {
  database: Db
}

const idSchema = z.uuid()

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function handleError(error: unknown) {
  if (error instanceof WebhookError) {
    return { statusCode: error.statusCode, body: { code: error.code, params: error.params } }
  }

  throw error
}

export const webhookRoutes = fp<WebhookRoutesOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/webhooks',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => webhookListResponseSchema.parse({ webhooks: await listWebhooks(database) }),
    )

    app.post(
      '/api/v1/webhooks',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = createWebhookRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          return reply
            .code(201)
            .send(createWebhookResponseSchema.parse(await createWebhook(database, parsed.data)))
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/webhooks/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const id = idSchema.safeParse(request.params.id)

        if (!id.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['id'] } })
        }

        const parsed = updateWebhookRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          return await updateWebhook(database, id.data, parsed.data)
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/webhooks/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const id = idSchema.safeParse(request.params.id)

        if (!id.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['id'] } })
        }

        try {
          await deleteWebhook(database, id.data)
          return reply.code(204).send()
        } catch (error) {
          const failure = handleError(error)
          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )
  },
  { name: 'stoerdesk-webhook-endpoints' },
)
