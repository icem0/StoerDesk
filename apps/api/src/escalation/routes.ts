import fp from 'fastify-plugin'

import { PERMISSIONS } from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  EscalationConfigError,
  readEscalationStages,
  readEscalationConfig,
  writeEscalationConfig,
  writeEscalationStages,
} from './config'
import { configuredChannels, emailEnvironment } from '../notifications/channels'
import { readEmailChannelConfiguration } from '../notifications/config'
import { loadEnv } from '../config/env'

/**
 * The administration routes of the escalation configuration
 * (`specs/07-escalation.md` §7.9, ADR-0017, WP-M13-05).
 *
 * `GET /api/v1/escalation/config` — `settings.read`, the stages, the rules and
 * their actions.
 * `PUT /api/v1/escalation/config` — `settings.write`, replaces the rules and
 * their actions in one transaction.
 * `PUT /api/v1/escalation/stages` — `settings.write`, replaces the whole stage
 * chain in one validated transaction (§7.11).
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
      '/api/v1/escalation-stages',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async () => ({ stages: await readEscalationStages(database) }),
    )

    app.get(
      '/api/v1/escalation/channels',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        // The channels of the instance carry the saved configuration of the
        // administration: the mailbox of the office is a channel of the
        // instance like every other configured channel (ADR-0046, WP-M41-02).
        const env = loadEnv()
        const email = await readEmailChannelConfiguration(database, env)

        return {
          channels: configuredChannels(emailEnvironment(env, email)).map((channel) => channel.name),
        }
      },
    )

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
