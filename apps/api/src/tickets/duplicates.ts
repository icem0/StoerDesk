import { and, asc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  OPEN_TICKET_STATUSES,
  isOpenTicketStatus,
  publicOpenTicketsQuerySchema,
  publicOpenTicketsResponseSchema,
  publicTicketCommentRequestSchema,
  publicTicketCommentResponseSchema,
  ticketNoSchema,
  type PublicOpenTickets,
  type PublicTicketComment,
  type PublicTicketCommentRequest,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { internalActionReceipts, objects, ticketEvents, tickets } from '../db/schema'
import { isReportSuspicious, recordReportAttempt } from './spam'

/**
 * Duplicate hint of the public report path (`specs/06-report-form.md` §7.8,
 * WP-M2-08).
 *
 * Two public routes, both unauthenticated:
 *
 * - `GET /api/v1/public/tickets/open` lists the open tickets of the object of
 *   the current QR token. The answer carries number, status and time only.
 * - `POST /api/v1/public/tickets/:ticketNo/comments` appends the text of the
 *   reporter to an open ticket of the same object. The **capability is the QR
 *   token of the object** — the code is printed on the object, so its holder is
 *   the reporter at the object. The `status_token` of a foreign ticket is never
 *   handed out, so nobody can watch or extend a ticket they did not report.
 *
 * The comment is one append-only `ticket_events` row (`type = 'comment'`), never
 * an edit of the ticket (`PLAN.md` §6).
 */

type Db = Database['database']

class DuplicateRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'DuplicateRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new DuplicateRouteError(400, 'invalid_request', { fields })
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

/** The current QR token of an **active** object — the same rule as §7.3. */
async function resolveObject(database: Db, qrToken: string) {
  const [object] = await database
    .select()
    .from(objects)
    .where(and(eq(objects.qrToken, qrToken), eq(objects.active, true)))
    .limit(1)

  if (object === undefined) {
    throw new DuplicateRouteError(404, 'qr_token_not_found', { fields: ['qrToken'] })
  }

  return object
}

/**
 * The open tickets of an object (§7.8.1). Without a system every open ticket of
 * the object counts; with a system the tickets of that system **and** the
 * tickets of the object without a system — a fault of the whole object concerns
 * every system. A suspected spam report never appears (§7.6).
 */
export async function findOpenTickets(
  database: Db,
  input: { qrToken: string },
): Promise<PublicOpenTickets> {
  const object = await resolveObject(database, input.qrToken)

  // All open tickets of the object count — there is no system level any more.
  const filters = [
    eq(tickets.objectId, object.id),
    inArray(tickets.status, [...OPEN_TICKET_STATUSES]),
    eq(tickets.suspectedSpam, false),
  ]

  const rows = await database
    .select({
      ticketId: tickets.id,
      ticketNo: tickets.ticketNo,
      status: tickets.status,
      reportedAt: tickets.reportedAt,
    })
    .from(tickets)
    .where(and(...filters))
    .orderBy(asc(tickets.reportedAt), asc(tickets.id))

  return publicOpenTicketsResponseSchema.parse({
    tickets: rows.map((row) => ({
      ticketId: row.ticketId,
      ticketNo: row.ticketNo,
      status: row.status,
      reportedAt: row.reportedAt.toISOString(),
    })),
  })
}

/** The contact of the comment payload — only the fields the reporter gave. */
function contactPayload(contact: PublicTicketCommentRequest['contact']) {
  const payload: Record<string, string> = {}

  if (contact.name !== undefined) {
    payload.name = contact.name
  }

  if (contact.phone !== undefined) {
    payload.phone = contact.phone
  }

  if (contact.email !== undefined) {
    payload.email = contact.email
  }

  return payload
}

/**
 * Appends the text of the reporter to an open ticket of the object (§7.8.2).
 * The ticket must belong to the object of the QR token and must still be open —
 * a ticket closed in the meantime answers `422 ticket_closed`.
 */
export async function addPublicComment(
  database: Db,
  input: PublicTicketCommentRequest & { ticketNo: string },
  context: { ip: string },
): Promise<PublicTicketComment> {
  if (!ticketNoSchema.safeParse(input.ticketNo).success) {
    throw new DuplicateRouteError(400, 'invalid_request', { fields: ['ticketNo'] })
  }

  const object = await resolveObject(database, input.qrToken)

  const [ticket] = await database
    .select()
    .from(tickets)
    .where(eq(tickets.ticketNo, input.ticketNo))
    .limit(1)

  if (ticket === undefined) {
    throw new DuplicateRouteError(404, 'ticket_not_found', { fields: ['ticketNo'] })
  }

  if (ticket.objectId !== object.id) {
    throw new DuplicateRouteError(422, 'ticket_object_mismatch', { fields: ['ticketNo'] })
  }

  if (!isOpenTicketStatus(ticket.status)) {
    throw new DuplicateRouteError(422, 'ticket_closed', { fields: ['ticketNo'] })
  }

  if ((input.text === undefined || input.text === '') && input.faultTemplateKeys.length === 0) {
    throw new DuplicateRouteError(422, 'comment_text_required', {
      fields: ['text', 'faultTemplateKeys'],
    })
  }

  // SEC-004: only the reporter who still holds the ticket's own status token
  // (delivered once by the report) may comment — the object QR alone is not
  // enough; it would let every holder of the printed QR comment every open
  // ticket of that object.
  if (ticket.statusToken === null || ticket.statusToken !== input.statusToken) {
    throw new DuplicateRouteError(403, 'comment_status_token_mismatch', { fields: ['statusToken'] })
  }

  // SEC-004 idempotency: the client UUID doubles as the replay key. A second
  // submission with the same UUID short-circuits, mirroring the internal
  // `applyInternalAction` pattern (WP-M5-03) — an attacker cannot fan out
  // one comment into the history by replaying it.
  const [existing] = await database
    .select({ eventId: internalActionReceipts.eventId })
    .from(internalActionReceipts)
    .where(eq(internalActionReceipts.clientUuid, input.clientUuid))
    .limit(1)

  if (existing !== undefined) {
    const [prior] = await database
      .select({ createdAt: ticketEvents.createdAt })
      .from(ticketEvents)
      .where(eq(ticketEvents.id, existing.eventId))
      .limit(1)

    if (prior !== undefined) {
      return publicTicketCommentResponseSchema.parse({
        ticketNo: ticket.ticketNo,
        at: prior.createdAt.toISOString(),
      })
    }
  }

  const attempt = { ip: context.ip, qrToken: input.qrToken }
  await recordReportAttempt(database, attempt)
  const suspicious = await isReportSuspicious(database, attempt)

  return await database.transaction(async (tx) => {
    const [event] = await tx
      .insert(ticketEvents)
      .values({
        ticketId: ticket.id,
        type: 'comment',
        actorKind: 'public',
        actorUserId: null,
        payload: {
          source: 'duplicate_hint',
          locale: input.locale,
          text: input.text ?? '',
          faultTemplateKeys: input.faultTemplateKeys,
          contact: contactPayload(input.contact),
          ...(suspicious ? { suspected_spam: true } : {}),
        },
      })
      .returning({ id: ticketEvents.id, createdAt: ticketEvents.createdAt })

    if (event === undefined) {
      throw new DuplicateRouteError(500, 'comment_not_written', { fields: ['ticketNo'] })
    }

    await tx
      .insert(internalActionReceipts)
      .values({
        clientUuid: input.clientUuid,
        ticketId: ticket.id,
        actorUserId: null,
        action: 'comment',
        eventId: event.id,
      })

    return publicTicketCommentResponseSchema.parse({
      ticketNo: ticket.ticketNo,
      at: event.createdAt.toISOString(),
    })
  })
}

export type PublicDuplicateRouteOptions = {
  database: Db
}

export const publicDuplicateRoutes = fp<PublicDuplicateRouteOptions>(
  async (app, { database }) => {
    app.get('/api/v1/public/tickets/open', async (request, reply) => {
      const parsed = publicOpenTicketsQuerySchema.safeParse(request.query)

      if (!parsed.success) {
        return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
      }

      const open = await findOpenTickets(database, parsed.data)

      return reply.code(200).send(open)
    })

    app.post<{ Params: { ticketNo: string } }>(
      '/api/v1/public/tickets/:ticketNo/comments',
      async (request, reply) => {
        const parsed = publicTicketCommentRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        const comment = await addPublicComment(
          database,
          {
            ...parsed.data,
            ticketNo: request.params.ticketNo,
          },
          { ip: request.ip },
        )

        return reply.code(201).send(comment)
      },
    )
  },
  { name: 'public-duplicate-routes' },
)
