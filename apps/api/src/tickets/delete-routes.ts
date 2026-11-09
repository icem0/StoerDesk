import fp from 'fastify-plugin'
import { z } from 'zod'

import { PERMISSIONS, ticketNoSchema } from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { deleteTicket } from './delete'

/**
 * Permanent ticket deletion (`PLAN.md` §7 rule 10, WP-M2-77).
 *
 * `DELETE /api/v1/tickets/:ticketNo` is guarded by `ticket.delete` (admin
 * only via `...PERMISSION_KEYS`) and delegates to `deleteTicket()`.
 */

type Db = Database['database']

const BODY = z.object({ reason: z.string().trim().max(1000).optional() })

export type DeleteRoutesOptions = {
  database: Db
  uploadDir: string
}

export const deleteRoutes = fp<DeleteRoutesOptions>(
  async (app, { database, uploadDir }) => {
    app.delete<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.delete) },
      async (request, reply) => {
        const { ticketNo } = request.params
        const actor = request.user

        if (actor === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const result = BODY.safeParse(request.body ?? {})
        if (!result.success) {
          return reply.code(400).send({ code: 'invalid_request', params: {} })
        }

        try {
          const deleted = await deleteTicket({
            database,
            uploadDir,
            ticketNo,
            actorUserId: actor.id,
            reason: result.data.reason ?? undefined,
          })

          return reply.code(200).send(deleted)
        } catch (error) {
          const err = error as { statusCode?: number; code?: string; params?: Record<string, unknown> }
          if (err.statusCode !== undefined) {
            if (err.statusCode >= 500) {
              request.log.error({ err: error }, 'ticket delete failed')
            }
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }
          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-ticket-delete-routes' },
)
