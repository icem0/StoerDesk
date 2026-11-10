import fp from 'fastify-plugin'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { PermissionKey } from '@stoerdesk/shared'

import { closeRequestSchema, PERMISSIONS, ticketNoSchema } from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { ticketEvents, tickets } from '../db/schema'
import { offerTicket } from '../oncall/coupling'
import { transitionTicket } from './workflow'
import { applyInternalAction } from './internal-actions'

/**
 * Workflow API routes (`PLAN.md` §7, WP-M2-19c).
 *
 * One POST route per workflow event, each guarded by the matching `ticket.*`
 * permission and delegating to `transitionTicket()`. The route resolves the
 * public `ticket_no` (e. g. `ST-2026-0001`) to the internal UUID before calling
 * `transitionTicket()`.
 */

type Db = Database['database']

const DECLINE_REASON = z.string().trim().min(5).max(1000)

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}
const OFFER_BODY = z.object({ poolId: z.string().uuid().optional() })
const ACK_RESULT = z.enum(['fixed', 'partially_fixed', 'follow_up_required', 'no_fault_found'])
const WORK_ORDER = z.object({
  type: z.string().trim().min(1).max(40),
  number: z.string().trim().min(1).max(60),
})

type RouteDef = {
  path: string
  event: string
  permission: PermissionKey
  body?: z.ZodTypeAny
  /** When set, the route accepts an optional `clientUuid` and replays through `applyInternalAction`. */
  action?: 'acknowledge' | 'decline' | 'comment'
}

function makeHandler(event: string, bodySchema?: z.ZodTypeAny, action?: RouteDef['action']) {
  return async (request: any, reply: any) => {
    const { ticketNo } = request.params
    const actor = request.user
    const { database } = request.server as { database: Db }

    if (actor === undefined) {
      return reply.code(401).send({ code: 'session_invalid', params: {} })
    }

    if (!ticketNoSchema.safeParse(ticketNo).success) {
      return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
    }

    // Resolve public ticket_no → internal UUID.
    const [row] = await database
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.ticketNo, ticketNo))
      .limit(1)

    if (row === undefined) {
      return reply.code(404).send({ code: 'ticket_not_found', params: { ticketNo } })
    }

    const result = bodySchema?.safeParse(request.body)
    if (bodySchema !== undefined && (!result || !result.success)) {
      return reply.code(400).send({ code: 'invalid_request', params: {} })
    }

    const body = result?.data ?? {}
    const clientUuid = (body as { clientUuid?: string }).clientUuid

    // With a clientUuid the action is idempotent: replay short-circuits through
    // `applyInternalAction`, which shares the receipt with the client outbox.
    if (action !== undefined && clientUuid !== undefined) {
      try {
        const applied = await applyInternalAction({
          database,
          ticketNo,
          clientUuid,
          action,
          actorUserId: actor.id,
          payload: body as Record<string, unknown>,
        })

        return reply.code(applied.replayed ? 200 : 200).send({ ...applied.ticket, replayed: applied.replayed })
      } catch (error) {
        const err = error as { statusCode?: number; code?: string; params?: Record<string, unknown> }
        if (err.statusCode !== undefined) {
          return reply.code(err.statusCode).send({ code: err.code, params: err.params })
        }
        throw error
      }
    }

    const payload: Record<string, unknown> = Object.assign({}, body) as Record<string, unknown>

    try {
      const { ticket: updated } = await transitionTicket({
        database,
        ticketId: row.id,
        event,
        actorUserId: actor.id,
        payload,
      })

      return reply.code(200).send(updated)
    } catch (error) {
      const err = error as { statusCode?: number; code?: string; params?: Record<string, unknown> }
      if (err.statusCode !== undefined) {
        return reply.code(err.statusCode).send({ code: err.code, params: err.params })
      }
      throw error
    }
  }
}

export type WorkflowRoutesOptions = {
  database: Db
}

const PERM = (key: string): PermissionKey => key as PermissionKey

export const workflowRoutes = fp<WorkflowRoutesOptions>(
  async (app, { database }) => {
    app.decorate('database', database)

    const routes: RouteDef[] = [
      { path: '/api/v1/tickets/:ticketNo/review', event: 'review_started', permission: PERM(PERMISSIONS.ticket.review) },
      { path: '/api/v1/tickets/:ticketNo/work-order', event: 'work_order_set', permission: PERM(PERMISSIONS.ticket.review), body: WORK_ORDER },
      { path: '/api/v1/tickets/:ticketNo/assign', event: 'assigned', permission: PERM(PERMISSIONS.ticket.assign) },
      { path: '/api/v1/tickets/:ticketNo/claim', event: 'claimed', permission: PERM(PERMISSIONS.ticket.claim) },
      { path: '/api/v1/tickets/:ticketNo/accept', event: 'accepted', permission: PERM(PERMISSIONS.ticket.accept) },
      { path: '/api/v1/tickets/:ticketNo/decline', event: 'declined', permission: PERM(PERMISSIONS.ticket.decline), body: z.object({ reason: DECLINE_REASON, clientUuid: z.string().uuid().optional() }), action: 'decline' },
      { path: '/api/v1/tickets/:ticketNo/acknowledge', event: 'acknowledged', permission: PERM(PERMISSIONS.ticket.acknowledge), body: z.object({ result: ACK_RESULT, note: z.string().trim().max(2000).optional(), clientUuid: z.string().uuid().optional() }), action: 'acknowledge' },
      { path: '/api/v1/tickets/:ticketNo/reopen', event: 'reopened', permission: PERM(PERMISSIONS.ticket.reopen), body: z.object({ reason: DECLINE_REASON }) },
      { path: '/api/v1/tickets/:ticketNo/cancel', event: 'cancelled', permission: PERM(PERMISSIONS.ticket.cancel), body: z.object({ reason: DECLINE_REASON }) },
      { path: '/api/v1/tickets/:ticketNo/uncancel', event: 'uncancelled', permission: PERM(PERMISSIONS.ticket.cancel), body: z.object({ reason: DECLINE_REASON }) },
    ]

    for (const route of routes) {
      app.post<{ Params: { ticketNo: string } }>(
        route.path,
        { preHandler: requirePermission(database, route.permission) },
        makeHandler(route.event, route.body, route.action),
      )
    }

    // Close accepts an optional body: `comment` is written as a `comment`
    // event, `detectedErrorKeys` is stored on `tickets.detected_error_keys`.
    // Both are optional; the `closed` state transition runs in the same
    // transaction (specs/13-detected-errors.md §13.3, WP-M11-04).
    app.post<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo/close',
      { preHandler: requirePermission(database, PERM(PERMISSIONS.ticket.close)) },
      async (request, reply) => {
        const actor = request.user

        if (actor === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(request.params.ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const parsed = closeRequestSchema.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const { comment, detectedErrorKeys } = parsed.data

        // Resolve public ticket_no → internal UUID.
        const [row] = await database
          .select({ id: tickets.id, status: tickets.status })
          .from(tickets)
          .where(eq(tickets.ticketNo, request.params.ticketNo))
          .limit(1)

        if (row === undefined) {
          return reply.code(404).send({ code: 'ticket_not_found', params: { ticketNo: request.params.ticketNo } })
        }

        try {
          const result = await database.transaction(async (tx) => {
            // 1. Optional comment event (append-only, like applyInternalAction).
            if (comment !== undefined && comment !== null) {
              await tx.insert(ticketEvents).values({
                ticketId: row.id,
                type: 'comment',
                actorKind: 'user',
                actorUserId: actor.id,
                payload: { text: comment },
              })
            }

            // 2. Optional detected_error_keys on the ticket row.
            if (detectedErrorKeys !== undefined && detectedErrorKeys !== null) {
              await tx
                .update(tickets)
                .set({ detectedErrorKeys, updatedAt: new Date() })
                .where(eq(tickets.id, row.id))
            }

            // 3. The closed state transition (its own event + timestamp).
            const { ticket: updated } = await transitionTicket({
              database: tx as unknown as Db,
              ticketId: row.id,
              event: 'closed',
              actorUserId: actor.id,
            })

            return updated
          })

          return reply.code(200).send(result)
        } catch (error) {
          const err = error as { statusCode?: number; code?: string; params?: Record<string, unknown> }
          if (err.statusCode !== undefined) {
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }
          throw error
        }
      },
    )

    // The offer is the only transition coupled to the on-call calendar
    // (`specs/04-oncall.md` §4a.6): it resolves the on-call person and assigns
    // the ticket inside the same transaction.
    app.post<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo/offer',
      { preHandler: requirePermission(database, PERM(PERMISSIONS.ticket.offer)) },
      async (request, reply) => {
        const actor = request.user

        if (actor === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(request.params.ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const parsed = OFFER_BODY.safeParse(request.body ?? {})

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: {} })
        }

        try {
          const { ticket, warning } = await offerTicket({
            database,
            ticketNo: request.params.ticketNo,
            actorUserId: actor.id,
            poolId: parsed.data.poolId,
          })

          return reply.code(200).send({
            ...ticket,
            ...(warning === undefined ? {} : { warning }),
          })
        } catch (error) {
          const err = error as {
            statusCode?: number
            code?: string
            params?: Record<string, unknown>
          }

          if (err.statusCode !== undefined) {
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }

          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-workflow-routes' },
)
