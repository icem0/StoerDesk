import fp from 'fastify-plugin'

import {
  deadlineHoursSchema,
  deadlineSettingsSchema,
  escalationRulesFor,
  PERMISSIONS,
  TICKET_PRIORITIES,
  type DeadlineSettings,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { readDeadlineHours } from '../tickets/deadline'
import { readOverrides } from '../tickets/escalation'

/**
 * Deadline and reaction settings (`specs/05-timeline.md` §5.1, ADR-0008,
 * WP-M6-14).
 *
 * `GET /api/v1/settings/deadlines` — `settings.read`, answers the effective values:
 * the deadline hours per priority and the four reaction minutes (standard and
 * critical), defaults where no row exists.
 * `GET /api/v1/settings/deadline-hours` — `ticket.create`, answers only the
 * effective deadline hours. Everyone who may create a ticket holds that
 * permission, including `reporter_internal` without `settings.read`; the create
 * form labels its priority options with these hours.
 * `PUT /api/v1/settings/deadlines` — `settings.write`, replaces all values in one
 * transaction. The values are stored as the bare numbers that `deadline.ts` and
 * the escalation scan already read: `ticket.deadline_hours.<priority>`,
 * `ticket.escalation.<rule>.minutes` and `ticket.escalation.<rule>.critical_minutes`.
 * A malformed body answers `400 invalid_request`.
 *
 * Existing tickets keep the deadline stored at their creation; the values apply
 * to tickets created and rules evaluated after the change.
 */

const REACTION_RULES = [
  'new_without_review',
  'work_order_without_distribution',
  'offered_without_claim',
  'assigned_without_accept',
] as const

type Db = Database['database']

function minutesOf(thresholdMs: number): number {
  return Math.round(thresholdMs / 60000)
}

async function readDeadlineSettings(database: Db): Promise<DeadlineSettings> {
  const [hours, overrides] = await Promise.all([
    readDeadlineHours(database),
    readOverrides(database),
  ])
  const standard = escalationRulesFor('normal', overrides)
  const critical = escalationRulesFor('critical', overrides)

  const reactionMinutes = Object.fromEntries(
    REACTION_RULES.map((rule) => [
      rule,
      {
        standard: minutesOf(standard.find((entry) => entry.key === rule)?.thresholdMs ?? 0),
        critical: minutesOf(critical.find((entry) => entry.key === rule)?.thresholdMs ?? 0),
      },
    ]),
  ) as DeadlineSettings['reactionMinutes']

  return deadlineSettingsSchema.parse({
    hours: {
      low: hours.low,
      normal: hours.normal,
      high: hours.high,
      critical: hours.critical,
    },
    reactionMinutes,
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
        const rows: { key: string; value: number }[] = [
          ...TICKET_PRIORITIES.map((priority) => ({
            key: `ticket.deadline_hours.${priority}`,
            value: body.hours[priority],
          })),
          ...REACTION_RULES.flatMap((rule) => [
            {
              key: `ticket.escalation.${rule}.minutes`,
              value: body.reactionMinutes[rule].standard,
            },
            {
              key: `ticket.escalation.${rule}.critical_minutes`,
              value: body.reactionMinutes[rule].critical,
            },
          ]),
        ]

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
