import fp from 'fastify-plugin'

import {
  deadlineHoursSchema,
  deadlineSettingsSchema,
  PERMISSIONS,
  TICKET_PRIORITIES,
  type DeadlineSettings,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { readDeadlineHours } from '../tickets/deadline'

/**
 * Deadline settings (`specs/05-timeline.md` §5.1, ADR-0008, WP-M6-14).
 *
 * `GET /api/v1/settings/deadlines` — `settings.read`, answers the deadline hours
 * per priority (defaults where no row exists).
 * `GET /api/v1/settings/deadline-hours` — `ticket.create`, answers only the
 * effective deadline hours. Everyone who may create a ticket holds that
 * permission, including `reporter_internal` without `settings.read`; the create
 * form labels its priority options with these hours.
 * `PUT /api/v1/settings/deadlines` — `settings.write`, replaces the hours in one
 * transaction. They are stored as the bare numbers `ticket.deadline_hours.<priority>`
 * that `deadline.ts` reads. A malformed body answers `400 invalid_request`.
 *
 * The reaction minutes of the former hard-coded rules are gone: the deadline of
 * a stage belongs to its rule in the escalation configuration
 * (`specs/07-escalation.md` §7.2, ADR-0017, WP-M13-13).
 *
 * Existing tickets keep the deadline stored at their creation; the values apply
 * to tickets created and rules evaluated after the change.
 */

type Db = Database['database']

async function readDeadlineSettings(database: Db): Promise<DeadlineSettings> {
  const hours = await readDeadlineHours(database)

  return deadlineSettingsSchema.parse({
    hours: {
      low: hours.low,
      normal: hours.normal,
      high: hours.high,
      critical: hours.critical,
    },
  })
}

export const settingsDeadlineRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/deadline-hours',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.create) },
      async () => deadlineHoursSchema.parse(await readDeadlineHours(database)),
    )

    app.get(
      '/api/v1/settings/deadlines',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => readDeadlineSettings(database),
    )

    app.put(
      '/api/v1/settings/deadlines',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = deadlineSettingsSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const body = parsed.data
        const rows: { key: string; value: number }[] = TICKET_PRIORITIES.map((priority) => ({
          key: `ticket.deadline_hours.${priority}`,
          value: body.hours[priority],
        }))

        await database.transaction(async (tx) => {
          for (const row of rows) {
            await tx
              .insert(settings)
              .values(row)
              .onConflictDoUpdate({
                target: settings.key,
                set: { value: row.value, updatedAt: new Date() },
              })
          }
        })

        return readDeadlineSettings(database)
      },
    )
  },
  { name: 'stoerdesk-settings-deadlines' },
)
