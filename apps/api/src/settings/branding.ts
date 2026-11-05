import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import { brandingResponseSchema, PERMISSIONS, updateBrandingRequestSchema } from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * Public branding settings (`PLAN.md` §14, WP-M2-29).
 *
 * One jsonb row under the key `branding` of the existing `settings` table:
 * `{ companyName, titleEnabled }`. No new table, no migration.
 *
 * `GET /api/v1/settings/branding` — `settings.read`, answers `{ companyName, titleEnabled }`
 * (`''` and `false` when nothing is configured yet).
 * `PUT /api/v1/settings/branding` — `settings.write`, upserts the row and
 * answers the stored value. A malformed body answers `400 invalid_request`.
 */

const BRANDING_KEY = 'branding'

function storedCompanyName(value: unknown): string {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { companyName?: unknown }).companyName === 'string'
      ? (value as { companyName: string }).companyName
      : ''
  )
}

function storedTitleEnabled(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { titleEnabled?: unknown }).titleEnabled === 'boolean'
      ? (value as { titleEnabled: boolean }).titleEnabled
      : false
  )
}

export const settingsBrandingRoutes = fp<{ database: Database['database'] }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/branding',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, BRANDING_KEY))
          .limit(1)

        return brandingResponseSchema.parse({
          companyName: storedCompanyName(rows[0]?.value),
          titleEnabled: storedTitleEnabled(rows[0]?.value),
        })
      },
    )

    app.put(
      '/api/v1/settings/branding',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateBrandingRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['companyName'] } })
        }

        await database
          .insert(settings)
          .values({ key: BRANDING_KEY, value: { companyName: parsed.data.companyName, titleEnabled: parsed.data.titleEnabled } })
          .onConflictDoUpdate({
            target: settings.key,
            set: {
              value: { companyName: parsed.data.companyName, titleEnabled: parsed.data.titleEnabled },
              updatedAt: new Date(),
            },
          })

        return brandingResponseSchema.parse({
          companyName: parsed.data.companyName,
          titleEnabled: parsed.data.titleEnabled,
        })
      },
    )
  },
  { name: 'stoerdesk-settings-branding' },
)
