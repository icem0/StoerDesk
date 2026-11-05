import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  computeTicketTimeline,
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

/** A ticket is open while it is neither closed nor cancelled (`specs/06-report-form.md` §7.8). */
const CLOSED_STATUSES: string[] = ['CLOSED', 'CANCELLED']

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

  if (query.open !== undefined) {
    conditions.push(
      query.open ? notInArray(tickets.status, CLOSED_STATUSES) : inArray(tickets.status, CLOSED_STATUSES),
    )
  }

  if (query.overdue !== undefined) {
    const pastDeadline = lt(tickets.deadlineAt, new Date())

    conditions.push(
      query.overdue
        ? and(pastDeadline, notInArray(tickets.status, CLOSED_STATUSES))
        : or(gte(tickets.deadlineAt, new Date()), inArray(tickets.status, CLOSED_STATUSES)),
    )
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

  const orderColumn =
    query.order === 'deadlineAt'
      ? tickets.deadlineAt
      : query.order === 'priority'
        ? sql`CASE ${tickets.priority}
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END`
        : tickets.reportedAt

  const orderDirection = query.direction === 'asc' ? asc : desc

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
      acknowledgedAt: tickets.acknowledgedAt,
      closedAt: tickets.closedAt,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .innerJoin(objects, eq(tickets.objectId, objects.id))
    .where(where)
    .orderBy(orderDirection(orderColumn))
    .limit(query.limit)
    .offset(query.offset)

  return {
    tickets: rows.map((row) => {
      const terminal = row.status === 'CLOSED' || row.status === 'CANCELLED'
      const stoppedAt = row.acknowledgedAt ??
        (terminal ? (row.closedAt ?? row.updatedAt) : null)
      const timeline = computeTicketTimeline({
        reportedAt: row.reportedAt,
        deadlineAt: row.deadlineAt,
        stoppedAt,
      })

      return {
        id: row.id,
        ticketNo: row.ticketNo,
        objectNo: row.objectNo,
        objectName: row.objectName,
        systemType: null,
        status: row.status,
        priority: row.priority,
        reportedAt: row.reportedAt.toISOString(),
        deadlineAt: row.deadlineAt.toISOString(),
        timelineState: timeline.state,
        percent: timeline.percent,
        remainingMs: timeline.remainingMs,
      }
    }),
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
