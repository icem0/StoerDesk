import { and, desc, eq, notInArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  customerObjectSchema,
  customerTicketDetailSchema,
  customerTicketSummarySchema,
  PERMISSIONS,
  ticketNoSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objectAssignments, objects, ticketEvents, tickets } from '../db/schema'

/** The id of the signed-in customer — the guard of the route needs a session. */
function customerIdOf(request: { user?: { id: string } }): string {
  return request.user?.id ?? ''
}

/**
 * The portal of the customer (`specs/19-customer-portal.md` §19.5, ADR-0053):
 * his own open tickets and his own objects.
 *
 * The routes answer only what belongs to the signed-in customer: a ticket of
 * somebody else is `404 ticket_not_found` — the customer has no business
 * knowing that it exists. The internal comments and the internal entries of
 * the history never reach the portal (ADR-0034, ADR-0038).
 */

type Db = Database['database']

class CustomerRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'CustomerRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/** The states a ticket leaves the list of the open tickets. */
const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED']

/** The entries of the history that never reach the customer (ADR-0034). */
const INTERNAL_EVENT_TYPES = ['internal_comment']

export type CustomerRouteOptions = {
  database: Db
}

export const customerRoutes = fp<CustomerRouteOptions>(async (app, { database }) => {
  app.get(
    '/api/v1/customer/tickets',
    { preHandler: requirePermission(database, PERMISSIONS.ticket.customerRead) },
    async (request) => {
      const rows = await database
        .select({
          ticketNo: tickets.ticketNo,
          title: tickets.title,
          objectName: objects.name,
          priority: tickets.priority,
          status: tickets.status,
          reportedAt: tickets.reportedAt,
          updatedAt: tickets.updatedAt,
        })
        .from(tickets)
        .innerJoin(objects, eq(objects.id, tickets.objectId))
        .where(
          and(
            eq(tickets.customerUserId, customerIdOf(request)),
            notInArray(tickets.status, TERMINAL_STATUSES),
          ),
        )
        .orderBy(desc(tickets.reportedAt))

      return {
        tickets: rows.map((row) =>
          customerTicketSummarySchema.parse({
            ...row,
            reportedAt: row.reportedAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }),
        ),
      }
    },
  )

  app.get<{ Params: { ticketNo: string } }>(
    '/api/v1/customer/tickets/:ticketNo',
    { preHandler: requirePermission(database, PERMISSIONS.ticket.customerRead) },
    async (request, reply) => {
      const parsed = ticketNoSchema.safeParse(request.params.ticketNo)

      if (!parsed.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
      }

      const rows = await database
        .select({
          id: tickets.id,
          ticketNo: tickets.ticketNo,
          title: tickets.title,
          description: tickets.description,
          objectName: objects.name,
          priority: tickets.priority,
          status: tickets.status,
          reportedAt: tickets.reportedAt,
          updatedAt: tickets.updatedAt,
        })
        .from(tickets)
        .innerJoin(objects, eq(objects.id, tickets.objectId))
        .where(
          and(eq(tickets.ticketNo, parsed.data), eq(tickets.customerUserId, customerIdOf(request))),
        )
        .limit(1)

      const [row] = rows

      if (row === undefined) {
        throw new CustomerRouteError(404, 'ticket_not_found', { ticketNo: parsed.data })
      }

      const events = await database
        .select({
          type: ticketEvents.type,
          payload: ticketEvents.payload,
          createdAt: ticketEvents.createdAt,
        })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, row.id))
        .orderBy(ticketEvents.createdAt)

      return customerTicketDetailSchema.parse({
        ticketNo: row.ticketNo,
        title: row.title,
        description: row.description,
        objectName: row.objectName,
        priority: row.priority,
        status: row.status,
        reportedAt: row.reportedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        events: events
          .filter((event) => !INTERNAL_EVENT_TYPES.includes(event.type))
          .map((event) => ({
            kind: event.type === 'comment' ? ('comment' as const) : ('event' as const),
            at: event.createdAt.toISOString(),
            text: textOf(event.payload, event.type),
          })),
      })
    },
  )

  app.get(
    '/api/v1/customer/objects',
    { preHandler: requirePermission(database, PERMISSIONS.object.customerRead) },
    async (request) => {
      const rows = await database
        .select({
          objectNo: objects.objectNo,
          name: objects.name,
          street: objects.street,
          city: objects.city,
        })
        .from(objectAssignments)
        .innerJoin(objects, eq(objects.id, objectAssignments.objectId))
        .where(eq(objectAssignments.userId, customerIdOf(request)))
        .orderBy(objects.objectNo)

      return { objects: rows.map((row) => customerObjectSchema.parse(row)) }
    },
  )
})

/** The text of an entry of the history — the comment, else the kind of the entry. */
function textOf(payload: unknown, type: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const text = (payload as { text?: unknown }).text

    if (typeof text === 'string' && text !== '') {
      return text
    }
  }

  return type
}
