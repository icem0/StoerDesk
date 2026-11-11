import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import {
  escalationStageName,
  manualEscalationRequestSchema,
  PERMISSIONS,
  ticketNoSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { ticketEvents, tickets } from '../db/schema'
import { readEscalationStages } from '../settings/escalation-stages'

/**
 * Manual escalation write (`specs/07-escalation.md` §7.5, WP-M12-05).
 *
 * Appends exactly one event and changes nothing else: `stageKey = null` writes a
 * `comment`, a known stage key writes `escalation_set` with the stage snapshot.
 * The route is guarded by `ticket.comment`.
 */

type Db = Database['database']

export type ManualEscalationRoutesOptions = {
  database: Db
}

export const manualEscalationRoutes = fp<ManualEscalationRoutesOptions>(
  async (app, { database }) => {
    app.post(
      '/api/v1/tickets/:ticketNo/escalate',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.comment) },
      async (request, reply) => {
        const { ticketNo } = request.params as { ticketNo: string }
        const actor = (request as { user?: { id: string } }).user

        if (actor === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(ticketNo).success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const parsed = manualEscalationRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({
            code: 'invalid_request',
            params: {
              fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))],
            },
          })
        }

        const [ticket] = await database
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.ticketNo, ticketNo))
          .limit(1)

        if (ticket === undefined) {
          return reply.code(404).send({ code: 'ticket_not_found', params: { ticketNo } })
        }

        const { stageKey, text } = parsed.data
        let payload: Record<string, unknown> = { text }
        let type = 'comment'

        if (stageKey !== null) {
          const stage = (await readEscalationStages(database)).find(
            (candidate) => candidate.key === stageKey,
          )

          if (stage === undefined) {
            return reply.code(400).send({
              code: 'invalid_request',
              params: { fields: ['stageKey'] },
            })
          }

          type = 'escalation_set'
          payload = {
            stageKey: stage.key,
            stageName: escalationStageName(stage, 'de'),
            text,
          }
        }

        await database.transaction(async (tx) => {
          await tx.insert(ticketEvents).values({
            ticketId: ticket.id,
            type,
            actorKind: 'user',
            actorUserId: actor.id,
            payload,
          })
        })

        return reply.code(200).send({ type, payload })
      },
    )
  },
  { name: 'stoerdesk-tickets-manual-escalation' },
)
