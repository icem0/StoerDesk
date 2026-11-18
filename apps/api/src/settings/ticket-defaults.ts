import fp from 'fastify-plugin'

import {
  objectPriorityOverrideListSchema,
  PERMISSIONS,
  ticketDefaultsSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import {
  prunePriorityOverrides,
  readPriorityOverrideList,
  readStandardPriority,
  STANDARD_PRIORITY_KEY,
} from '../objects/priority'

/**
 * The standard priority of the instance (ADR-0029, `specs/02-data-model.md`
 * §4.3.2, WP-M14-134d).
 *
 * `GET /api/v1/settings/ticket-defaults` — `settings.read`, answers the
 * standard (`normal` without a row).
 * `PUT /api/v1/settings/ticket-defaults` — `settings.write`, replaces the
 * standard in one transaction and deletes the deviations that no longer
 * deviate: the table holds only what differs from the standard.
 * `GET /api/v1/settings/ticket-defaults/overrides` — `settings.read`, answers
 * the objects whose priority differs from the standard.
 *
 * A malformed body answers `400 invalid_request`, like the routes of
 * `apps/api/src/settings/deadlines.ts`.
 */

type Db = Database['database']

export const settingsTicketDefaultsRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/ticket-defaults',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => ticketDefaultsSchema.parse({ priority: await readStandardPriority(database) }),
    )

    app.put(
      '/api/v1/settings/ticket-defaults',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = ticketDefaultsSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const priority = parsed.data.priority

        await database.transaction(async (tx) => {
          await tx
            .insert(settings)
            .values({ key: STANDARD_PRIORITY_KEY, value: priority })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: priority, updatedAt: new Date() },
            })

          await prunePriorityOverrides(tx, priority)
        })

        return ticketDefaultsSchema.parse({ priority })
      },
    )

    app.get(
      '/api/v1/settings/ticket-defaults/overrides',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () =>
        objectPriorityOverrideListSchema.parse({
          overrides: await readPriorityOverrideList(database),
        }),
    )
  },
  { name: 'stoerdesk-settings-ticket-defaults' },
)
