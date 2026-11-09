import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import { brandingResponseSchema, PERMISSIONS, updateBrandingRequestSchema } from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { BRANDING_KEY, parseTitleEnabled } from './branding-state'

/**
 * Public branding settings (`PLAN.md` §14, WP-M2-29 / WP-M4-09).
 *
 * One jsonb row under the key `branding` of the existing `settings` table:
 * `{ companyName, titleEnabled, logo }`. No new table, no migration.
 *
 * `GET /api/v1/settings/branding` — `settings.read`, answers `{ companyName, titleEnabled, logo }`
 * (`''`, `false` and `''` when nothing is configured yet).
 * `PUT /api/v1/settings/branding` — `settings.write`, upserts the row and
 * answers the stored value. A malformed body answers `400 invalid_request`.
 * `logo` is an optional `data:image/jpeg` / `data:image/png` base64 URL (at most
 * `MAX_LOGO_BYTES`); `''` or `null` removes the logo.
 */

/** At most 500 kB of logo payload stored in the settings row. */
const MAX_LOGO_BYTES = 500 * 1024

/** `data:image/jpeg` / `data:image/png` base64 data URL. */
const LOGO_DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/

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
  return parseTitleEnabled(value)
}

function storedLogo(value: unknown): string {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { logo?: unknown }).logo === 'string'
      ? (value as { logo: string }).logo
      : ''
  )
}

/** Validates an optional logo data URL; `''`/`null`/`undefined` means "remove". */
function validateLogo(logo: unknown): string | { code: string; params: Record<string, unknown> } {
  if (logo === undefined || logo === null || logo === '') {
    return ''
  }
  if (typeof logo !== 'string' || !LOGO_DATA_URL.test(logo)) {
    return { code: 'invalid_request', params: { fields: ['logo'] } }
  }
  const payload = logo.split(',')[1] ?? ''
  if (Buffer.from(payload, 'base64').byteLength > MAX_LOGO_BYTES) {
    return { code: 'invalid_request', params: { fields: ['logo'] } }
  }
  return logo
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
          logo: storedLogo(rows[0]?.value),
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

        const logo = validateLogo(parsed.data.logo)
        if (typeof logo === 'object') {
          return reply.code(400).send(logo)
        }

        await database
          .insert(settings)
          .values({
            key: BRANDING_KEY,
            value: { companyName: parsed.data.companyName, titleEnabled: parsed.data.titleEnabled, logo },
          })
          .onConflictDoUpdate({
            target: settings.key,
            set: {
              value: {
                companyName: parsed.data.companyName,
                titleEnabled: parsed.data.titleEnabled,
                logo,
              },
              updatedAt: new Date(),
            },
          })

        return brandingResponseSchema.parse({
          companyName: parsed.data.companyName,
          titleEnabled: parsed.data.titleEnabled,
          logo,
        })
      },
    )
  },
  { name: 'stoerdesk-settings-branding' },
)
