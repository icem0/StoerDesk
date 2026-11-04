import { and, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  internalCreateTicketRequestSchema,
  internalCreateTicketResponseSchema,
  PERMISSIONS,
  type InternalCreateTicketRequest,
  type InternalCreateTicketResponse,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, systems, ticketEvents, tickets } from '../db/schema'
import { applyInternalAction } from './internal-actions'

/**
 * Internal ticket creation (`PLAN.md` §7 rule 1, WP-M2-15).
 *
 * Authenticated `POST /api/v1/tickets` for staff. Creates one `tickets` row with
 * `status = 'NEW'`, `source = 'INTERNAL'`, auto-generated `ticket_no` and
 * `status_token`, plus one append-only `created` event with `actor_kind = 'user'`.
 */

type Db = Database['database']

class InternalTicketRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'InternalTicketRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

const INTERNAL_DEADLINE_MS = 72 * 60 * 60 * 1000

export async function createInternalTicket(
  database: Db,
  input: InternalCreateTicketRequest,
  actorUserId: string,
): Promise<InternalCreateTicketResponse> {
  // Resolve the object (must be active).
  const [object] = await database
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.id, input.objectId))
    .limit(1)

  if (object === undefined) {
    throw new InternalTicketRouteError(404, 'object_not_found', { fields: ['objectId'] })
  }

  // If a system is given, it must belong to this object.
  if (input.systemId !== undefined) {
    const [system] = await database
      .select({ id: systems.id })
      .from(systems)
      .where(
        and(
          eq(systems.id, input.systemId),
          eq(systems.objectId, object.id),
        ),
      )
      .limit(1)

    if (system === undefined) {
      throw new InternalTicketRouteError(422, 'system_not_found', { fields: ['systemId'] })
    }
  }

  const now = new Date()
  const deadlineAt = new Date(now.getTime() + INTERNAL_DEADLINE_MS)

  return await database.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        objectId: object.id,
        systemId: input.systemId ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        faultTemplateKeys: input.faultTemplateKeys,
        priority: input.priority,
        source: 'INTERNAL',
        reportedAt: now,
        receivedAt: now,
        deadlineAt,
        reporterName: input.contact?.name ?? null,
        reporterPhone: input.contact?.phone ?? null,
        reporterEmail: input.contact?.email ?? null,
      })
      .returning()

    if (ticket === undefined) {
      throw new InternalTicketRouteError(500, 'ticket_create_failed', {})
    }

    await tx.insert(ticketEvents).values({
      ticketId: ticket.id,
      type: 'created',
      actorKind: 'user',
      actorUserId,
      payload: {
        source: 'INTERNAL',
        priority: input.priority,
        faultTemplateKeys: input.faultTemplateKeys,
        hasContact: Boolean(input.contact?.name || input.contact?.phone || input.contact?.email),
      },
    })

    return {
      ticketId: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status,
      statusToken: ticket.statusToken ?? '',
      reportedAt: ticket.reportedAt.toISOString(),
      receivedAt: ticket.receivedAt.toISOString(),
      deadlineAt: ticket.deadlineAt.toISOString(),
    }
  })
}

export type InternalTicketRouteOptions = {
  database: Db
}

export const internalTicketRoutes = fp<InternalTicketRouteOptions>(
  async (app, { database }) => {
    app.post(
      '/api/v1/tickets',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.create) },
      async (request, reply) => {
        const parsed = internalCreateTicketRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const user = request.user

        if (user === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        try {
          const result = await createInternalTicket(database, parsed.data, user.id)
          return reply.code(201).send(internalCreateTicketResponseSchema.parse(result))
        } catch (error) {
          if (error instanceof InternalTicketRouteError) {
            return reply.code(error.statusCode).send({ code: error.code, params: error.params })
          }
          throw error
        }
      },
    )

    const COMMENT_BODY = z.object({
      clientUuid: z.string().uuid(),
      text: z.string().trim().min(1).max(2000),
    })

    app.post<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo/comments',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.comment) },
      async (request, reply) => {
        const parsed = COMMENT_BODY.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const user = request.user

        if (user === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        try {
          const applied = await applyInternalAction({
            database,
            ticketNo: request.params.ticketNo,
            clientUuid: parsed.data.clientUuid,
            action: 'comment',
            actorUserId: user.id,
            payload: { text: parsed.data.text },
          })

          const body = { ticketNo: applied.ticket.ticketNo, at: applied.event.createdAt.toISOString(), replayed: applied.replayed }

          return reply.code(applied.replayed ? 200 : 201).send(body)
        } catch (error) {
          const err = error as { statusCode?: number; code?: string; params?: Record<string, unknown> }
          if (err.statusCode !== undefined) {
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }
          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-internal-tickets' },
)
