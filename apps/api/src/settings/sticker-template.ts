import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  DEFAULT_STICKER_TEMPLATE,
  PERMISSIONS,
  STICKER_TEMPLATE_PRESETS,
  stickerPresetKeyOf,
  stickerTemplateResponseSchema,
  stickerTemplateSchema,
  updateStickerTemplateRequestSchema,
  type StickerAppearance,
  type StickerGeometry,
  type StickerTemplate,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * The sticker template of the installation (ADR-0050, `specs/08-objects-api.md`
 * §9.3).
 *
 * One jsonb row under the key `sticker.template` of the existing `settings`
 * table: `{ templateKey, geometry, appearance }`. No new table, no migration.
 *
 * `GET /api/v1/settings/sticker-template` — `object.read`, answers
 * `{ template }`. Everybody who may print a sticker may read the template; a
 * sticker is no secret.
 * `PUT /api/v1/settings/sticker-template` — `settings.write`, upserts the row
 * and answers the stored template. A malformed body and a geometry that does
 * not fit on its sheet answer `400 invalid_request` with the field path.
 *
 * A field that is absent keeps the stored value. A body with the key of a
 * preset and no geometry takes the geometry of that preset over; a body with a
 * geometry decides the key itself — a geometry that no preset describes is
 * `custom`.
 */

const STICKER_TEMPLATE_KEY = 'sticker.template'

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

/** The stored template, or the default of the server when the row is missing or malformed. */
function storedTemplate(value: unknown): StickerTemplate {
  const parsed = stickerTemplateSchema.safeParse(value)

  return parsed.success ? parsed.data : DEFAULT_STICKER_TEMPLATE
}

function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  if (value === undefined) {
    return {}
  }

  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined)

  return Object.fromEntries(entries) as Partial<T>
}

function presetGeometry(key: string): StickerGeometry | null {
  return STICKER_TEMPLATE_PRESETS.find((preset) => preset.key === key)?.geometry ?? null
}

export const settingsStickerTemplateRoutes = fp<{ database: Database['database'] }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/sticker-template',
      { preHandler: requirePermission(database, PERMISSIONS.object.read) },
      async () => {
        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, STICKER_TEMPLATE_KEY))
          .limit(1)

        return stickerTemplateResponseSchema.parse({ template: storedTemplate(rows[0]?.value) })
      },
    )

    app.put(
      '/api/v1/settings/sticker-template',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateStickerTemplateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, STICKER_TEMPLATE_KEY))
          .limit(1)

        const current = storedTemplate(rows[0]?.value)
        const body = parsed.data

        // A body with the key of a preset and no geometry takes the geometry of
        // that preset over; the free grid keeps the stored geometry.
        const takenPreset =
          body.geometry === undefined && body.templateKey !== undefined
            ? presetGeometry(body.templateKey)
            : null

        const geometry: StickerGeometry = {
          ...current.geometry,
          ...definedOnly(body.geometry),
          ...(takenPreset ?? {}),
        }

        const appearance: StickerAppearance = {
          ...current.appearance,
          ...definedOnly(body.appearance),
        }

        // The geometry decides the key of the catalog: a geometry that no preset
        // describes is the free grid.
        const templateKey =
          body.geometry === undefined && body.templateKey !== undefined
            ? body.templateKey
            : stickerPresetKeyOf(geometry)

        const template = stickerTemplateSchema.safeParse({ templateKey, geometry, appearance })

        if (!template.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(template.error) } })
        }

        await database
          .insert(settings)
          .values({
            key: STICKER_TEMPLATE_KEY,
            value: template.data,
          })
          .onConflictDoUpdate({
            target: settings.key,
            set: {
              value: template.data,
              updatedAt: new Date(),
            },
          })

        return stickerTemplateResponseSchema.parse({ template: template.data })
      },
    )
  },
  { name: 'stoerdesk-settings-sticker-template' },
)
