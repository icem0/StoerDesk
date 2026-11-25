import { and, asc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  PUBLIC_TICKET_EVENT_TYPES,
  isOpenTicketStatus,
  publicObjectCommentRequestSchema,
  publicObjectCommentResponseSchema,
  publicObjectTicketSchema,
  ticketNoSchema,
} from '@stoerdesk/shared'
import type { PublicObjectComment, PublicObjectTicket } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { internalActionReceipts, objects, ticketEvents, tickets } from '../db/schema'
import { isReportSuspicious, recordReportAttempt } from './spam'

/**
 * The public view of an open ticket of an object and the comment of the object
 * (`specs/06-report-form.md` §7.10, ADR-0061).
 *
 * The holder of the QR code of an object stands at that object. That code is
 * the capability of two things: the **narrow** view of a ticket that is open
 * there (the number, the status, the times, the public events and the public
 * comments — never the description, the contact or the photos of another
 * reporter) and a **comment** on such a ticket. The comment is an append-only
 * event like every comment; the office sees its source (`object_qr`), the
 * public view shows its text without the contact of the author.
 *
 * SEC-004 keeps its force for the path of §7.8.2: the `status_token` of a
 * foreign ticket is still the only way to a ticket of another object.
 */

type Db = Database['database']

class ObjectTicketError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ObjectTicketError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/** The current QR token of an **active** object — the same rule as §7.3. */
async function resolveObject(database: Db, qrToken: string) {
  const [object] = await database
    .select()
    .from(objects)
    .where(and(eq(objects.qrToken, qrToken), eq(objects.active, true)))
    .limit(1)

  if (object === undefined) {
    throw new ObjectTicketError(404, 'qr_token_not_found', { fields: ['qrToken'] })
  }

  return object
}

/**
 * The open ticket of the object of the token.
 *
 * A ticket of another object, a closed ticket and an unknown number answer
 * the same `404`: a caller of the code must not learn that a closed ticket of
 * the object exists.
 */
async function resolveOpenTicket(database: Db, qrToken: string, ticketNo: string) {
  const object = await resolveObject(database, qrToken)

  const [ticket] = await database.select().from(tickets).where(eq(tickets.ticketNo, ticketNo)).limit(1)

  if (ticket === undefined || ticket.objectId !== object.id) {
    throw new ObjectTicketError(404, 'ticket_not_found', { fields: ['ticketNo'] })
  }

  if (!isOpenTicketStatus(ticket.status)) {
    throw new ObjectTicketError(404, 'ticket_not_found', { fields: ['ticketNo'] })
  }

  return { object, ticket }
}

/** The text of a comment — the free text or, if there is none, the fault keys. */
function commentText(payload: unknown): { text: string; faultTemplateKeys: string[] } {
  const data = (typeof payload === 'object' && payload !== null ? payload : {}) as {
    text?: unknown
    faultTemplateKeys?: unknown
  }

  const keys = Array.isArray(data.faultTemplateKeys)
    ? data.faultTemplateKeys.filter((key): key is string => typeof key === 'string')
    : []

  const text = typeof data.text === 'string' ? data.text : ''

  return { text, faultTemplateKeys: keys }
}

/**
 * The public view of an open ticket of the object (§7.10.3).
 */
export async function readObjectTicket(
  database: Db,
  input: { qrToken: string; ticketNo: string },
): Promise<PublicObjectTicket> {
  const { ticket } = await resolveOpenTicket(database, input.qrToken, input.ticketNo)

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

  const comments = await database
    .select({ payload: ticketEvents.payload, createdAt: ticketEvents.createdAt })
    .from(ticketEvents)
    .where(and(eq(ticketEvents.ticketId, ticket.id), eq(ticketEvents.type, 'comment')))
    .orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id))

  return publicObjectTicketSchema.parse({
    ticketNo: ticket.ticketNo,
    status: ticket.status,
    reportedAt: ticket.reportedAt.toISOString(),
    deadlineAt: ticket.deadlineAt.toISOString(),
    events: events.map((event) => ({
      type: event.type,
      at: event.createdAt.toISOString(),
    })),
    comments: comments.map((comment) => {
      const content = commentText(comment.payload)

      return {
        at: comment.createdAt.toISOString(),
        text: content.text,
        faultTemplateKeys: content.faultTemplateKeys,
      }
    }),
  })
}

/**
 * The comment of the object (§7.10.4): one append-only event, idempotent over
 * the `client_uuid` and counted in the spam limit of §7.6.
 */
export async function addObjectComment(
  database: Db,
  input: { qrToken: string; ticketNo: string; text?: string; faultTemplateKeys: string[]; contact: Record<string, string | undefined>; locale: string; clientUuid: string },
  context: { ip: string },
): Promise<PublicObjectComment> {
  const { ticket } = await resolveOpenTicket(database, input.qrToken, input.ticketNo)

  if ((input.text ?? '') === '' && input.faultTemplateKeys.length === 0) {
    throw new ObjectTicketError(422, 'comment_text_required', {
      fields: ['text', 'faultTemplateKeys'],
    })
  }

  // The idempotency of the replay: a second submission with the same UUID
  // answers with the event of the first one.
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
      return publicObjectCommentResponseSchema.parse({
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
          source: 'object_qr',
          locale: input.locale,
          text: input.text ?? '',
          faultTemplateKeys: input.faultTemplateKeys,
          contact: input.contact,
          ...(suspicious ? { suspected_spam: true } : {}),
        },
      })
      .returning({ id: ticketEvents.id, createdAt: ticketEvents.createdAt })

    if (event === undefined) {
      throw new ObjectTicketError(500, 'comment_not_written', { fields: ['ticketNo'] })
    }

    await tx.insert(internalActionReceipts).values({
      clientUuid: input.clientUuid,
      ticketId: ticket.id,
      actorUserId: null,
      action: 'comment',
      eventId: event.id,
    })

    return publicObjectCommentResponseSchema.parse({
      ticketNo: ticket.ticketNo,
      at: event.createdAt.toISOString(),
    })
  })
}

export type ObjectTicketRouteOptions = {
  database: Db
}

export const publicObjectTicketRoutes = fp<ObjectTicketRouteOptions>(
  async (app, { database }) => {
    app.get<{ Params: { token: string; ticketNo: string } }>(
      '/api/v1/public/objects/:token/tickets/:ticketNo',
      async (request, reply) => {
        const ticketNo = ticketNoSchema.safeParse(request.params.ticketNo)

        if (!ticketNo.success) {
          return reply.code(400).send({
            code: 'invalid_request',
            params: { fields: ['ticketNo'] },
          })
        }

        const ticket = await readObjectTicket(database, {
          qrToken: request.params.token,
          ticketNo: ticketNo.data,
        })

        return reply.code(200).send(ticket)
      },
    )

    app.post<{ Params: { token: string; ticketNo: string } }>(
      '/api/v1/public/objects/:token/tickets/:ticketNo/comments',
      async (request, reply) => {
        const parsed = publicObjectCommentRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({
            code: 'invalid_request',
            params: { fields: Object.keys(parsed.error.issues[0]?.path ?? {}) },
          })
        }

        const comment = await addObjectComment(
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
  { name: 'public-object-ticket-routes' },
)

