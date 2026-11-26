import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  customerNotificationsRequestSchema,
  customerObjectSchema,
  customerTicketDetailSchema,
  customerTicketSummarySchema,
  PERMISSIONS,
  ticketNoSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import { readCustomerPortalSwitches } from '../settings/customers'
import type { Database } from '../db/client'
import { objectAssignments, objects, ticketEvents, tickets } from '../db/schema'

/**
 * The tickets of the customer: the ones whose customer he is and the ones
 * that carry his address — a report he made before his registration belongs
 * to him as well (§19.5).
 */
function ownTickets(request: { user?: { id: string; email: string } }) {
  const email = request.user?.email ?? ''

  return or(
    eq(tickets.customerUserId, customerIdOf(request)),
    email === '' ? undefined : sql`lower(${tickets.reporterEmail}) = lower(${email})`,
  )
}
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

/**
 * The guard of the portal (§19.13, ADR-0062): the portal of the customer is
 * switched off in many installations — his reports are then nobody's business.
 *
 * The guard is a **preHandler of the routes** and not a hook: the plugin uses
 * `fastify-plugin` and is therefore not encapsulated — a hook would guard
 * every route of the app.
 */
function requireCustomerPortal(database: Db) {
  return async (
    _request: unknown,
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const switches = await readCustomerPortalSwitches(database)

    if (!switches.portalEnabled) {
      return reply.code(403).send({ code: 'customer_portal_disabled', params: {} })
    }
  }
}

export type CustomerRouteOptions = {
  database: Db
}

export const customerRoutes = fp<CustomerRouteOptions>(async (app, { database }) => {
  app.get(
    '/api/v1/customer/tickets',
    {
      preHandler: [
        requirePermission(database, PERMISSIONS.ticket.customerRead),
        requireCustomerPortal(database),
      ],
    },
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
          emailNotifications: tickets.customerEmailNotifications,
        })
        .from(tickets)
        .innerJoin(objects, eq(objects.id, tickets.objectId))
        .where(ownTickets(request))
        // The open tickets of the customer come first, the closed ones below
        // them (ADR-0061) — inside a group the newest ticket is first.
        .orderBy(asc(sql`${tickets.status} in ('CLOSED', 'CANCELLED')`), desc(tickets.reportedAt))

      return {
        tickets: rows.map((row) =>
          customerTicketSummarySchema.parse({
            ...row,
            reportedAt: row.reportedAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            open: !TERMINAL_STATUSES.includes(row.status),
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
          emailNotifications: tickets.customerEmailNotifications,
        })
        .from(tickets)
        .innerJoin(objects, eq(objects.id, tickets.objectId))
        .where(and(eq(tickets.ticketNo, parsed.data), ownTickets(request)))
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
        open: !TERMINAL_STATUSES.includes(row.status),
        emailNotifications: row.emailNotifications,
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

  app.patch<{ Params: { ticketNo: string } }>(
    '/api/v1/customer/tickets/:ticketNo/notifications',
    { preHandler: requirePermission(database, PERMISSIONS.ticket.customerRead) },
    async (request, reply) => {
      const parsedTicketNo = ticketNoSchema.safeParse(request.params.ticketNo)

      if (!parsedTicketNo.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
      }

      const parsed = customerNotificationsRequestSchema.safeParse(request.body)

      if (!parsed.success) {
        return reply.code(400).send({
          code: 'invalid_request',
          params: { fields: ['emailNotifications'] },
        })
      }

      // §19.6: the decision belongs to the reporter — only his own ticket is
      // changed, and a ticket of somebody else does not exist for him.
      const updated = await database
        .update(tickets)
        .set({ customerEmailNotifications: parsed.data.emailNotifications })
        .where(
          and(
            eq(tickets.ticketNo, parsedTicketNo.data),
            eq(tickets.customerUserId, customerIdOf(request)),
          ),
        )
        .returning({ ticketNo: tickets.ticketNo })

      if (updated.length === 0) {
        throw new CustomerRouteError(404, 'ticket_not_found', {
          ticketNo: parsedTicketNo.data,
        })
      }

      return {
        ticketNo: updated[0]?.ticketNo,
        emailNotifications: parsed.data.emailNotifications,
      }
    },
  )

  app.get(
    '/api/v1/customer/objects',
    {
      preHandler: [
        requirePermission(database, PERMISSIONS.object.customerRead),
        requireCustomerPortal(database),
      ],
    },
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
