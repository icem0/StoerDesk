import { eq, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import type { z } from 'zod'
import {
  PERMISSIONS,
  ticketNoSchema,
  type ExternalTicketCreateRequest,
  type InternalCreateTicketResponse,
  workOrderRequestSchema,
  type WorkOrderRequest,
} from '@stoerdesk/shared'

import { requireScopeOrPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, ticketEvents, tickets } from '../db/schema'
import { readTitleEnabled } from '../settings/branding-state'
import { deadlineAtForPriority } from './deadline'
import { transitionTicket } from './workflow'

/**
 * External ticket API (`specs/08-objects-api.md` §9.5, ADR-0013, WP-M10-08).
 * External creation resolves the object by `objectNo`, writes `source = 'API'`
 * and records a `system` actor with the key id. The work-order update uses the
 * same state machine as the office route and adds no new transition.
 */

type Db = Database['database']

export class ExternalTicketError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ExternalTicketError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

export async function createExternalTicket(
  database: Db,
  input: ExternalTicketCreateRequest,
  apiKeyId: string,
): Promise<InternalCreateTicketResponse> {
  const [object] = await database
    .select({ id: objects.id })
    .from(objects)
    .where(sql`lower(${objects.objectNo}) = lower(${input.objectNo})`)
    .limit(1)

  if (object === undefined) {
    throw new ExternalTicketError(404, 'object_not_found', { fields: ['objectNo'] })
  }

  const titleEnabled = await readTitleEnabled(database)
  const now = new Date()
  const deadlineAt = await deadlineAtForPriority(database, now, input.priority)

  return database.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        objectId: object.id,
        title: titleEnabled ? (input.title ?? null) : null,
        description: input.description ?? null,
        faultTemplateKeys: input.faultTemplateKeys,
        priority: input.priority,
        source: 'API',
        reportedAt: now,
        receivedAt: now,
        deadlineAt,
        reporterName: input.contact?.name ?? null,
        reporterPhone: input.contact?.phone ?? null,
        reporterEmail: input.contact?.email ?? null,
      })
      .returning()

    if (ticket === undefined) {
      throw new ExternalTicketError(500, 'ticket_create_failed')
    }

    await tx.insert(ticketEvents).values({
      ticketId: ticket.id,
      type: 'created',
      actorKind: 'system',
      actorUserId: null,
      payload: {
        source: 'API',
        apiKeyId,
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

export async function updateExternalWorkOrder(
  database: Db,
  ticketNo: string,
  input: WorkOrderRequest,
  actor: { apiKeyId?: string; actorUserId?: string },
) {
  const [row] = await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.ticketNo, ticketNo))
    .limit(1)

  if (row === undefined) {
    throw new ExternalTicketError(404, 'ticket_not_found', { ticketNo })
  }

  return transitionTicket({
    database,
    ticketId: row.id,
    event: 'work_order_set',
    ...(actor.apiKeyId === undefined
      ? { actorKind: 'user' as const, actorUserId: actor.actorUserId }
      : { actorKind: 'system' as const, apiKeyId: actor.apiKeyId }),
    payload: input,
  })
}

export type ExternalTicketRouteOptions = {
  database: Db
}

export const externalTicketRoutes = fp<ExternalTicketRouteOptions>(
  async (app, { database }) => {
    app.patch<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo/work-order',
      { preHandler: requireScopeOrPermission(database, 'tickets:write', PERMISSIONS.ticket.review) },
      async (request, reply) => {
        const apiKey = request.apiKey
        const user = request.user

        if (apiKey === undefined && user === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(request.params.ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const parsed = workOrderRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          const { ticket } = await updateExternalWorkOrder(
            database,
            request.params.ticketNo,
            parsed.data,
            apiKey === undefined ? { actorUserId: user?.id } : { apiKeyId: apiKey.id },
          )

          return reply.code(200).send(ticket)
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
  { name: 'stoerdesk-external-tickets' },
)
