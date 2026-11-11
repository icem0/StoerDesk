import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import {
  DEFAULT_ESCALATION_STAGES,
  ESCALATION_STAGES_KEY,
  escalationStagesSchema,
  PERMISSIONS,
  type EscalationStage,
  type EscalationStages,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * Manual escalation-stage catalog (`PLAN.md` §9, `specs/07-escalation.md` §7.5).
 *
 * The catalog is one `settings` row (`ticket.escalation_stages`) holding the
 * ordered stages. `GET /api/v1/escalation-stages` is the staff read for the
 * ticket view (`ticket.read`); `GET/PUT /api/v1/settings/escalation-stages` is
 * the administration pair (`settings.read`/`settings.write`). A missing or
 * malformed row falls back to `DEFAULT_ESCALATION_STAGES`.
 */

type Db = Database['database']

export async function readEscalationStages(database: Db): Promise<EscalationStage[]> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, ESCALATION_STAGES_KEY))
    .limit(1)

  if (row === undefined) {
    return [...DEFAULT_ESCALATION_STAGES]
  }

  const parsed = escalationStagesSchema.safeParse(row.value)

  return parsed.success ? parsed.data.stages : [...DEFAULT_ESCALATION_STAGES]
}

function fieldPaths(error: { issues: { path: PropertyKey[] }[] }): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

export type EscalationStageRoutesOptions = {
  database: Db
}

export const escalationStageRoutes = fp<EscalationStageRoutesOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/escalation-stages',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async (): Promise<EscalationStages> => ({
        stages: await readEscalationStages(database),
      }),
    )

    app.get(
      '/api/v1/settings/escalation-stages',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async (): Promise<EscalationStages> => ({
        stages: await readEscalationStages(database),
      }),
    )

    app.put(
      '/api/v1/settings/escalation-stages',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = escalationStagesSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const value = parsed.data

        await database
          .insert(settings)
          .values({ key: ESCALATION_STAGES_KEY, value })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value, updatedAt: new Date() },
          })

        return value
      },
    )
  },
  { name: 'stoerdesk-settings-escalation-stages' },
)
