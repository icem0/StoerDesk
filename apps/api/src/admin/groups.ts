import { and, count, eq, ne } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createGroupRequestSchema,
  groupListResponseSchema,
  groupSummarySchema,
  updateGroupRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { groups, userGroups } from '../db/schema'

type Db = Database['database']

class GroupRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'GroupRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } }
}

async function countMembers(database: Db, groupId: string): Promise<number> {
  const rows = await database
    .select({ value: count() })
    .from(userGroups)
    .where(eq(userGroups.groupId, groupId))

  return Number(rows[0]?.value ?? 0)
}

async function findGroup(database: Db, id: string): Promise<{ id: string; name: string }> {
  const rows = await database
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    throw new GroupRouteError(404, 'group_not_found', { fields: ['id'] })
  }

  return row
}

function parseGroupId(raw: string) {
  return z.uuid().safeParse(raw)
}

export type AdminGroupsRouteOptions = {
  database: Database['database']
}

export const adminGroupsRoutes = fp<AdminGroupsRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/groups',
      { preHandler: requirePermission(database, 'user.read') },
      async () => {
        const groupRows = await database
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .orderBy(groups.name)

        const memberRows = await database
          .select({ groupId: userGroups.groupId, value: count() })
          .from(userGroups)
          .groupBy(userGroups.groupId)

        const memberCounts = new Map(
          memberRows.map((row) => [row.groupId, Number(row.value) as number]),
        )

        return groupListResponseSchema.parse({
          groups: groupRows.map((row) =>
            groupSummarySchema.parse({
              id: row.id,
              name: row.name,
              userCount: memberCounts.get(row.id) ?? 0,
            }),
          ),
        })
      },
    )

    app.post(
      '/api/v1/groups',
      { preHandler: requirePermission(database, 'user.write') },
      async (request, reply) => {
        const parsed = createGroupRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const { name } = parsed.data

        const duplicate = await database
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.name, name))
          .limit(1)

        if (duplicate.length > 0) {
          return reply.code(409).send({ code: 'group_name_taken', params: { fields: ['name'] } })
        }

        const [row] = await database
          .insert(groups)
          .values({ name })
          .returning({ id: groups.id, name: groups.name })

        if (row === undefined) {
          throw new GroupRouteError(500, 'group_create_failed', { fields: ['name'] })
        }

        return reply.code(201).send(groupSummarySchema.parse({ ...row, userCount: 0 }))
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/groups/:id',
      { preHandler: requirePermission(database, 'user.write') },
      async (request, reply) => {
        const parsedId = parseGroupId(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = updateGroupRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const targetId = parsedId.data
        const body = parsed.data

        await findGroup(database, targetId)

        if (body.name !== undefined) {
          const duplicate = await database
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.name, body.name), ne(groups.id, targetId)))
            .limit(1)

          if (duplicate.length > 0) {
            return reply.code(409).send({ code: 'group_name_taken', params: { fields: ['name'] } })
          }
        }

        const [row] = await database
          .update(groups)
          .set({ ...(body.name === undefined ? {} : { name: body.name }), updatedAt: new Date() })
          .where(eq(groups.id, targetId))
          .returning({ id: groups.id, name: groups.name })

        if (row === undefined) {
          throw new GroupRouteError(404, 'group_not_found', { fields: ['id'] })
        }

        return reply.code(200).send(groupSummarySchema.parse({ ...row, userCount: await countMembers(database, targetId) }))
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/groups/:id',
      { preHandler: requirePermission(database, 'user.write') },
      async (request, reply) => {
        const parsedId = parseGroupId(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const targetId = parsedId.data

        await findGroup(database, targetId)

        const members = await countMembers(database, targetId)

        if (members > 0) {
          return reply
            .code(409)
            .send({ code: 'group_in_use', params: { fields: ['id'], userCount: members } })
        }

        await database.delete(groups).where(eq(groups.id, targetId))

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-admin-groups' },
)
