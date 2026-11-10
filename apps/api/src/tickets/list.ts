import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
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
  escapeLikePattern,
  externalTicketListQuerySchema,
  PERMISSIONS,
  ticketListQuerySchema,
  ticketListResponseSchema,
  type TicketListQuery,
  type TicketListResponse,
} from '@stoerdesk/shared'

import { requireScopeOrPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, tickets } from '../db/schema'

/**
 * Ticket list (`PLAN.md` §6, WP-M2-17).
 *
 * Authenticated `GET /api/v1/tickets` for staff. Paginated list with object
 * number/name, status, priority, reportedAt and deadlineAt. Filters: search
 * (object number / name), status, objectId, priority. Requires `ticket.read`.
 *
 * `order=deadlineAt` sorts by the deadline in the requested direction and
 * puts the open tickets before the finished ones (WP-M9-20,
 * `specs/05-timeline.md` §5.4).
 */

type Db = Database['database']

/** A ticket is open while it is neither closed nor cancelled (`specs/06-report-form.md` §7.8). */
const CLOSED_STATUSES: string[] = ['CLOSED', 'CANCELLED']

/**
 * The deadline order puts the open tickets before the finished ones (WP-M9-20):
 * the nearest deadline is on top and the closed and cancelled tickets keep the
 * last places, so the list does not start with the oldest closed ticket.
 */
const OPEN_FIRST = sql`CASE WHEN ${tickets.status} IN ('CLOSED', 'CANCELLED') THEN 1 ELSE 0 END`

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

type TicketListFilter = TicketListQuery & { updated_since?: string; objectNo?: string }

export async function listTickets(
  database: Db,
  query: TicketListFilter,
): Promise<TicketListResponse> {
  const conditions = []

  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`
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

  if (query.objectNo !== undefined) {
    conditions.push(eq(objects.objectNo, query.objectNo))
  }

  if (query.updated_since !== undefined) {
    conditions.push(gt(tickets.updatedAt, new Date(query.updated_since)))
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
    query.order === 'priority'
      ? sql`CASE ${tickets.priority}
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END`
      : tickets.reportedAt

  const orderDirection = query.direction === 'asc' ? asc : desc

  // The ticket number is the tie-breaker, so the pages of a list stay stable
  // when two tickets share a deadline.
  const orderColumns =
    query.updated_since !== undefined
      ? [asc(tickets.updatedAt), asc(tickets.ticketNo)]
      : query.order === 'deadlineAt'
        ? [asc(OPEN_FIRST), orderDirection(tickets.deadlineAt), asc(tickets.ticketNo)]
        : [orderDirection(orderColumn)]

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
    .orderBy(...orderColumns)
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
      { preHandler: requireScopeOrPermission(database, 'tickets:read', PERMISSIONS.ticket.read) },
      async (request, reply) => {
        const parsed =
          request.apiKey === undefined
            ? ticketListQuerySchema.safeParse(request.query)
            : externalTicketListQuerySchema.safeParse(request.query)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const query =
          request.apiKey === undefined
            ? parsed.data
            : {
                ...parsed.data,
                open: undefined,
                overdue: undefined,
                order: 'reportedAt' as const,
                direction: 'desc' as const,
                offset: 0,
              }
        const result = await listTickets(database, query as TicketListFilter)
        return reply.code(200).send(ticketListResponseSchema.parse(result))
      },
    )
  },
  { name: 'stoerdesk-ticket-list' },
)
