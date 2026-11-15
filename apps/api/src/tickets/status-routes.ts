import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  PERMISSIONS,
  ticketStatusNotFoundCode,
  ticketStatusCreateRequestSchema,
  ticketStatusUpdateRequestSchema,
  ticketStatusKeySchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  createTicketStatus,
  deleteTicketStatus,
  readTicketStatuses,
  updateTicketStatus,
} from './status-service'

/**
 * The status administration API (`specs/07-escalation.md` §7.1, WP-M14-36).
 *
 * `GET /api/v1/admin/statuses` — `settings.read`, every status with its names,
 * its flags and the number of the tickets that carry it.
 * `POST /api/v1/admin/statuses` — `settings.write`, creates a status key.
 * `PATCH /api/v1/admin/statuses/:key` — `settings.write`, edits names, color,
 * position, the active switch or the terminal flag; the key stays immutable.
 * `DELETE /api/v1/admin/statuses/:key` — `settings.write`, removes a status no
 * ticket carries (`409 status_in_use`) and never the last active one.
 *
 * A malformed body answers `400 invalid_request` with the field paths.
 */

type Db = Database['database']

class TicketStatusRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketStatusRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

export const ticketStatusRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/admin/statuses',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => ({ statuses: await readTicketStatuses(database) }),
    )

    app.post(
      '/api/v1/admin/statuses',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = ticketStatusCreateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new TicketStatusRouteError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
        }

        return reply.code(201).send(await createTicketStatus(database, parsed.data))
      },
    )

    app.patch<{ Params: { key: string } }>(
      '/api/v1/admin/statuses/:key',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = ticketStatusUpdateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new TicketStatusRouteError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
        }

        return reply.code(200).send(await updateTicketStatus(database, request.params.key, parsed.data))
      },
    )

    app.delete<{ Params: { key: string } }>(
      '/api/v1/admin/statuses/:key',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        if (!ticketStatusKeySchema.safeParse(request.params.key).success) {
          throw new TicketStatusRouteError(404, ticketStatusNotFoundCode, { fields: ['key'] })
        }

        await deleteTicketStatus(database, request.params.key)

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-ticket-status-routes' },
)
