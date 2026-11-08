import { asc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  oncallSwapListResponseSchema,
  oncallSwapSchema,
  PERMISSIONS,
  swapAcceptResponseSchema,
  swapIdParamSchema,
  swapRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { oncallPools, oncallShifts, oncallSwapRequests } from '../db/schema'
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
    // Administration overview of the open and accepted swap requests
    // (`specs/04-oncall.md` §4a.5; WP-M8-13b). The pending list is the input of
    // the admin page's approve/reject actions.
    app.get<{ Querystring: { status?: string } }>(
      '/api/v1/oncall/swaps',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const parsed = z
          .object({ status: z.enum(['PENDING', 'ACCEPTED']).optional() })
          .safeParse(request.query)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(['status']))
        }

        const statuses =
          parsed.data.status === undefined ? ['PENDING', 'ACCEPTED'] : [parsed.data.status]

        const rows = await database
          .select({
            id: oncallSwapRequests.id,
            shiftId: oncallSwapRequests.shiftId,
            requestedByUserId: oncallSwapRequests.requestedByUserId,
            targetUserId: oncallSwapRequests.targetUserId,
            status: oncallSwapRequests.status,
            acceptedByUserId: oncallSwapRequests.acceptedByUserId,
            acceptedAt: oncallSwapRequests.acceptedAt,
            approvedByUserId: oncallSwapRequests.approvedByUserId,
            approvedAt: oncallSwapRequests.approvedAt,
            createdAt: oncallSwapRequests.createdAt,
            updatedAt: oncallSwapRequests.updatedAt,
            poolId: oncallShifts.poolId,
            poolName: oncallPools.name,
            startsAt: oncallShifts.startsAt,
            endsAt: oncallShifts.endsAt,
          })
          .from(oncallSwapRequests)
          .innerJoin(oncallShifts, eq(oncallShifts.id, oncallSwapRequests.shiftId))
          .innerJoin(oncallPools, eq(oncallPools.id, oncallShifts.poolId))
          .where(inArray(oncallSwapRequests.status, statuses))
          .orderBy(asc(oncallShifts.startsAt))

        return reply.send(
          oncallSwapListResponseSchema.parse({
            swaps: rows.map((row) => ({
              id: row.id,
              shiftId: row.shiftId,
              requestedByUserId: row.requestedByUserId,
              targetUserId: row.targetUserId,
              status: row.status,
              acceptedByUserId: row.acceptedByUserId,
              acceptedAt: row.acceptedAt,
              approvedByUserId: row.approvedByUserId,
              approvedAt: row.approvedAt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              shift: {
                id: row.shiftId,
                poolId: row.poolId,
                poolName: row.poolName,
                startsAt: row.startsAt,
                endsAt: row.endsAt,
              },
            })),
          }),
        )
      },
    )

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
