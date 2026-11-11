import fp from 'fastify-plugin'

import { PERMISSIONS } from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  EscalationConfigError,
  readEscalationConfig,
  writeEscalationConfig,
  writeEscalationStages,
} from './config'

/**
 * The administration routes of the escalation configuration
 * (`specs/07-escalation.md` §7.9, ADR-0017, WP-M13-05).
 *
 * `GET /api/v1/escalation/config` — `settings.read`, the stages, the rules and
 * their actions.
 * `PUT /api/v1/escalation/config` — `settings.write`, replaces the rules and
 * their actions in one transaction.
 * `PUT /api/v1/escalation/stages` — `settings.write`, replaces the names, the
 * position and the active flag of the five stages.
 *
 * A malformed body answers `400 invalid_request` with the field paths.
 */

type Db = Database['database']

export type EscalationRoutesOptions = {
  database: Db
}

function handleError(error: unknown) {
  if (error instanceof EscalationConfigError) {
    return { statusCode: error.statusCode, body: { code: error.code, params: error.params } }
  }

  throw error
}

export const escalationRoutes = fp<EscalationRoutesOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/escalation/config',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => readEscalationConfig(database),
    )

    app.put(
      '/api/v1/escalation/config',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        try {
          return await writeEscalationConfig(database, request.body)
        } catch (error) {
          const failure = handleError(error)

          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )

    app.put(
      '/api/v1/escalation/stages',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        try {
          return await writeEscalationStages(database, request.body)
        } catch (error) {
          const failure = handleError(error)

          return reply.code(failure.statusCode).send(failure.body)
        }
      },
    )
  },
  { name: 'stoerdesk-escalation-config' },
)
