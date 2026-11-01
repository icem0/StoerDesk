import { and, asc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  PUBLIC_TICKET_EVENT_TYPES,
  publicTicketStatusResponseSchema,
  qrTokenSchema,
  type PublicTicketStatus,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { ticketEvents, tickets } from '../db/schema'

/**
 * Public status endpoint (`specs/06-report-form.md` §7.3.4/§7.7, WP-M2-06).
 *
 * The reporter follows `/s/<status_token>` from the confirmation page and has no
 * session, so this route is unauthenticated. It answers only the ticket number,
 * the current status and the public timeline — never event payloads, actors,
 * contact data, descriptions or internal comments. The UI is WP-M2-06b.
 */

type Db = Database['database']

class StatusRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'StatusRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/**
 * Reads one public status by token. An unknown token and a malformed token both
 * answer the same `404`, so the route never tells a caller which one it was.
 */
export async function getPublicTicketStatus(
  database: Db,
  token: string,
): Promise<PublicTicketStatus> {
  if (!qrTokenSchema.safeParse(token).success) {
    throw new StatusRouteError(404, 'status_token_not_found')
  }

  const [ticket] = await database
    .select()
    .from(tickets)
    .where(eq(tickets.statusToken, token))
    .limit(1)

  if (ticket === undefined) {
    throw new StatusRouteError(404, 'status_token_not_found')
  }

  const events = await database
    .select({ type: ticketEvents.type, createdAt: ticketEvents.createdAt })
    .from(ticketEvents)
    .where(
      and(
        eq(ticketEvents.ticketId, ticket.id),
        inArray(ticketEvents.type, [...PUBLIC_TICKET_EVENT_TYPES]),
      ),
    )
    .orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id))

  return publicTicketStatusResponseSchema.parse({
    ticketNo: ticket.ticketNo,
    status: ticket.status,
    reportedAt: ticket.reportedAt.toISOString(),
    deadlineAt: ticket.deadlineAt.toISOString(),
    events: events.map((event) => ({
      type: event.type,
      at: event.createdAt.toISOString(),
    })),
  })
}

export type PublicStatusRouteOptions = {
  database: Db
}

export const publicStatusRoutes = fp<PublicStatusRouteOptions>(
  async (app, { database }) => {
    app.get<{ Params: { token: string } }>(
      '/api/v1/public/tickets/:token/status',
      async (request, reply) => {
        const status = await getPublicTicketStatus(database, request.params.token)

        return reply.code(200).send(status)
      },
    )
  },
  { name: 'public-status-routes' },
)
