import fp from 'fastify-plugin'
import {
  oncallSwapSchema,
  PERMISSIONS,
  swapAcceptResponseSchema,
  swapIdParamSchema,
  swapRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { acceptSwap, approveSwap, cancelSwap, rejectSwap, requestSwap } from './swaps'

type Db = Database['database']

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } as Record<string, unknown> }
}

function errorReply(error: unknown) {
  const err = error as {
    statusCode?: number
    code?: string
    params?: Record<string, unknown>
  }

  if (err.statusCode !== undefined) {
    return { statusCode: err.statusCode, body: { code: err.code, params: err.params } }
  }

  return null
}

export type SwapRoutesOptions = {
  database: Db
}

export const swapRoutes = fp<SwapRoutesOptions>(
  async (app, { database }) => {
    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/shifts/:id/swap',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.swap) },
      async (request, reply) => {
        const id = swapIdParamSchema.safeParse(request.params)

        if (!id.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = swapRequestSchema.safeParse(request.body ?? {})

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        try {
          const result = await requestSwap(database, {
            shiftId: id.data.id,
            actorUserId: request.user?.id ?? '',
            targetUserId: parsed.data.targetUserId,
          })

          return reply.code(201).send(oncallSwapSchema.parse(result.swap))
        } catch (error) {
          const mapped = errorReply(error)

          if (mapped !== null) {
            return reply.code(mapped.statusCode).send(mapped.body)
          }

          throw error
        }
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/swaps/:id/accept',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.swap) },
      async (request, reply) => {
        const id = swapIdParamSchema.safeParse(request.params)

        if (!id.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        try {
          const result = await acceptSwap(database, {
            swapId: id.data.id,
            actorUserId: request.user?.id ?? '',
          })

          return reply.send(swapAcceptResponseSchema.parse(result))
        } catch (error) {
          const mapped = errorReply(error)

          if (mapped !== null) {
            return reply.code(mapped.statusCode).send(mapped.body)
          }

          throw error
        }
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/swaps/:id/approve',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const id = swapIdParamSchema.safeParse(request.params)

        if (!id.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        try {
          const result = await approveSwap(database, {
            swapId: id.data.id,
            actorUserId: request.user?.id ?? '',
          })

          return reply.send(oncallSwapSchema.parse(result.swap))
        } catch (error) {
          const mapped = errorReply(error)

          if (mapped !== null) {
            return reply.code(mapped.statusCode).send(mapped.body)
          }

          throw error
        }
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/swaps/:id/reject',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const id = swapIdParamSchema.safeParse(request.params)

        if (!id.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        try {
          const result = await rejectSwap(database, {
            swapId: id.data.id,
            actorUserId: request.user?.id ?? '',
          })

          return reply.send(oncallSwapSchema.parse(result.swap))
        } catch (error) {
          const mapped = errorReply(error)

          if (mapped !== null) {
            return reply.code(mapped.statusCode).send(mapped.body)
          }

          throw error
        }
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/swaps/:id/cancel',
      {
        preHandler: requirePermission(
          database,
          PERMISSIONS.oncall.swap,
          PERMISSIONS.oncall.admin,
        ),
      },
      async (request, reply) => {
        const id = swapIdParamSchema.safeParse(request.params)

        if (!id.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        try {
          const result = await cancelSwap(database, {
            swapId: id.data.id,
            actorUserId: request.user?.id ?? '',
          })

          return reply.send(oncallSwapSchema.parse(result.swap))
        } catch (error) {
          const mapped = errorReply(error)

          if (mapped !== null) {
            return reply.code(mapped.statusCode).send(mapped.body)
          }

          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-oncall-swap-routes' },
)
