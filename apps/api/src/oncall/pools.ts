import { eq, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createPoolRequestSchema,
  oncallPoolSchema,
  PERMISSIONS,
  poolListResponseSchema,
  updatePoolRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { oncallPools, oncallShifts } from '../db/schema'

type Db = Database['database']

class PoolRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'PoolRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new PoolRouteError(400, 'invalid_request', { fields })
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

async function findPoolById(database: Db, id: string) {
  const [pool] = await database
    .select()
    .from(oncallPools)
    .where(eq(oncallPools.id, id))
    .limit(1)

  return pool
}

async function countShifts(database: Db, poolId: string): Promise<number> {
  const rows = await database
    .select({ count: sql<number>`count(${oncallShifts.id})` })
    .from(oncallShifts)
    .where(eq(oncallShifts.poolId, poolId))

  return Number(rows[0]?.count ?? 0)
}

export type OncallPoolsRouteOptions = {
  database: Db
}

export const oncallPoolsRoutes = fp<OncallPoolsRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/oncall/pools',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.read) },
      async () => {
        const rows = await database
          .select({
            id: oncallPools.id,
            name: oncallPools.name,
            groupId: oncallPools.groupId,
            active: oncallPools.active,
            createdAt: oncallPools.createdAt,
            updatedAt: oncallPools.updatedAt,
            shiftCount: sql<number>`count(${oncallShifts.id})`.mapWith(Number),
          })
          .from(oncallPools)
          .leftJoin(oncallShifts, eq(oncallShifts.poolId, oncallPools.id))
          .groupBy(oncallPools.id)
          .orderBy(oncallPools.name)

        return poolListResponseSchema.parse({ pools: rows })
      },
    )

    app.post(
      '/api/v1/oncall/pools',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const parsed = createPoolRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(invalidRequest([...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]))
        }

        try {
          const [created] = await database
            .insert(oncallPools)
            .values({ name: parsed.data.name, groupId: parsed.data.groupId })
            .returning()

          return reply.code(201).send(oncallPoolSchema.parse(created))
        } catch (error) {
          if (isUniqueViolation(error)) {
            return reply.code(409).send({
              code: 'oncall_pool_name_taken',
              params: { fields: ['name'] },
            })
          }

          throw error
        }
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/oncall/pools/:id',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = updatePoolRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(invalidRequest([...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]))
        }

        const pool = await findPoolById(database, parsedId.data)

        if (pool === undefined) {
          return reply.code(404).send({ code: 'oncall_pool_not_found', params: { fields: ['id'] } })
        }

        try {
          const [updated] = await database
            .update(oncallPools)
            .set({
              ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
              ...(parsed.data.groupId !== undefined ? { groupId: parsed.data.groupId } : {}),
              ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
              updatedAt: new Date(),
            })
            .where(eq(oncallPools.id, parsedId.data))
            .returning()

          return reply.code(200).send(oncallPoolSchema.parse(updated))
        } catch (error) {
          if (isUniqueViolation(error)) {
            return reply.code(409).send({
              code: 'oncall_pool_name_taken',
              params: { fields: ['name'] },
            })
          }

          throw error
        }
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/oncall/pools/:id',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const pool = await findPoolById(database, parsedId.data)

        if (pool === undefined) {
          return reply.code(404).send({ code: 'oncall_pool_not_found', params: { fields: ['id'] } })
        }

        const shiftCount = await countShifts(database, parsedId.data)

        if (shiftCount > 0) {
          return reply.code(409).send({
            code: 'oncall_pool_in_use',
            params: { fields: ['id'], shiftCount },
          })
        }

        await database.delete(oncallPools).where(eq(oncallPools.id, parsedId.data))

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-oncall-pools' },
)
