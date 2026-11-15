import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  PERMISSIONS,
  ticketStatusKeySchema,
  ticketTransitionEventKeySchema,
  ticketTransitionNotFoundCode,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  createTicketTransition,
  deleteTicketTransition,
  readTicketTransitions,
  updateTicketTransition,
} from './transition-service'

/**
 * The transition administration API (`specs/07-escalation.md` §7.13, ADR-0025,
 * WP-M14-39).
 *
 * `GET /api/v1/admin/transitions` — `settings.read`, every row of `ticket_transitions`
 * (active and inactive) in the order of `from_status` and `event_key`.
 * `POST /api/v1/admin/transitions` — `settings.write`, creates one step: both status
 * keys must name a row of `ticket_statuses` (`400 invalid_status_key` with the field
 * path) and the pair `(from_status, event_key)` must stay unique (`409
 * transition_duplicate`, the unique index of migration `0041` is the database
 * backstop of both rules).
 * `PATCH /api/v1/admin/transitions/:id` — `settings.write`, edits the endpoints, the
 * event key, the stored `condition` or the `active` switch; the `id` stays the identity
 * of the row and never enters the body.
 * `DELETE /api/v1/admin/transitions/:id` — `settings.write`, removes one row; ADR-0025
 * keeps the trade-off of an empty workflow visible in the UI, the administration
 * itself never blocks a delete on a step count.
 *
 * A malformed body answers `400 invalid_request` with the field paths; an unknown
 * `id` answers `404 transition_not_found`. Both status keys are format-bound to
 * `ticketStatusKeySchema` and the event key to `^[a-z][a-z0-9_]{0,39}$`.
 */

type Db = Database['database']

class TicketTransitionRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketTransitionRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

const conditionSchema = z.record(z.string(), z.unknown()).nullable()

const transitionCreateRequestSchema = z.object({
  fromStatus: ticketStatusKeySchema,
  toStatus: ticketStatusKeySchema,
  eventKey: ticketTransitionEventKeySchema,
  condition: conditionSchema.default(null),
  active: z.boolean().default(true),
})

const transitionUpdateRequestSchema = z.object({
  fromStatus: ticketStatusKeySchema.optional(),
  toStatus: ticketStatusKeySchema.optional(),
  eventKey: ticketTransitionEventKeySchema.optional(),
  condition: conditionSchema.optional(),
  active: z.boolean().optional(),
})

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

export const ticketTransitionRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/admin/transitions',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => ({ transitions: await readTicketTransitions(database) }),
    )

    app.post(
      '/api/v1/admin/transitions',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = transitionCreateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new TicketTransitionRouteError(
            400,
            'invalid_request',
            { fields: fieldPaths(parsed.error) },
          )
        }

        return reply.code(201).send(
          await createTicketTransition(
            database,
            {
              fromStatus: parsed.data.fromStatus,
              toStatus: parsed.data.toStatus,
              eventKey: parsed.data.eventKey,
              condition: parsed.data.condition,
              active: parsed.data.active,
            },
          ),
        )
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/admin/transitions/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        if (!z.uuid().safeParse(request.params.id).success) {
          throw new TicketTransitionRouteError(
            404,
            ticketTransitionNotFoundCode,
            { fields: ['id'] },
          )
        }

        const parsed = transitionUpdateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new TicketTransitionRouteError(
            400,
            'invalid_request',
            { fields: fieldPaths(parsed.error) },
          )
        }

        return reply.code(200).send(
          await updateTicketTransition(
            database,
            request.params.id,
            {
              fromStatus: parsed.data.fromStatus,
              toStatus: parsed.data.toStatus,
              eventKey: parsed.data.eventKey,
              condition: parsed.data.condition,
              active: parsed.data.active,
            },
          ),
        )
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/admin/transitions/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        if (!z.uuid().safeParse(request.params.id).success) {
          throw new TicketTransitionRouteError(
            404,
            ticketTransitionNotFoundCode,
            { fields: ['id'] },
          )
        }

        await deleteTicketTransition(database, request.params.id)

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-ticket-transition-routes' },
)
