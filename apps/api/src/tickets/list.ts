import { and, count, eq, ilike, or } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  PERMISSIONS,
  ticketListQuerySchema,
  ticketListResponseSchema,
  type TicketListQuery,
  type TicketListResponse,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, tickets } from '../db/schema'

/**
 * Ticket list (`PLAN.md` §6, WP-M2-17).
 *
 * Authenticated `GET /api/v1/tickets` for staff. Paginated list with object
 * number/name, status, priority, reportedAt and deadlineAt. Filters: search
 * (object number / name), status, objectId, priority. Requires `ticket.read`.
 */

type Db = Database['database']

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

export async function listTickets(
  database: Db,
  query: TicketListQuery,
): Promise<TicketListResponse> {
  const conditions = []

  if (query.search) {
    const pattern = `%${query.search}%`
    conditions.push(
      or(
        ilike(objects.objectNo, pattern),
        ilike(objects.name, pattern),
      ),
    )
  }

  if (query.status !== undefined) {
    conditions.push(eq(tickets.status, query.status))
  }

  if (query.objectId !== undefined) {
    conditions.push(eq(tickets.objectId, query.objectId))
  }

  if (query.priority !== undefined) {
    conditions.push(eq(tickets.priority, query.priority))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalResult] = await database
    .select({ count: count() })
    .from(tickets)
    .innerJoin(objects, eq(tickets.objectId, objects.id))
    .where(where)

  const total = Number(totalResult?.count ?? 0)

  const rows = await database
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      objectNo: objects.objectNo,
      objectName: objects.name,
      status: tickets.status,
      priority: tickets.priority,
      reportedAt: tickets.reportedAt,
      deadlineAt: tickets.deadlineAt,
    })
    .from(tickets)
    .innerJoin(objects, eq(tickets.objectId, objects.id))
    .where(where)
    .orderBy(tickets.reportedAt)
    .limit(query.limit)
    .offset(query.offset)

  return {
    tickets: rows.map((row) => ({
      id: row.id,
      ticketNo: row.ticketNo,
      objectNo: row.objectNo,
      objectName: row.objectName,
      systemType: null,
      status: row.status,
      priority: row.priority,
      reportedAt: row.reportedAt.toISOString(),
      deadlineAt: row.deadlineAt.toISOString(),
    })),
    total,
    limit: query.limit,
    offset: query.offset,
  }
}

export type TicketListRouteOptions = {
  database: Db
}

export const ticketListRoutes = fp<TicketListRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/tickets',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async (request, reply) => {
        const parsed = ticketListQuerySchema.safeParse(request.query)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const result = await listTickets(database, parsed.data)
        return reply.code(200).send(ticketListResponseSchema.parse(result))
      },
    )
  },
  { name: 'stoerdesk-ticket-list' },
)
