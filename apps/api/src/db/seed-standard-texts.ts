import { eq } from 'drizzle-orm'
import { STANDARD_TEXT_KEYS, STANDARD_TEXTS } from '@stoerdesk/shared'

import type { Database } from './client'
import * as schema from './schema'

/**
 * Bootstrap of the standard fault types (`specs/02-data-model.md` §4.5,
 * WP-M2-42).
 *
 * The eight standard texts are inserted into `text_templates` with their `de`
 * and `en` row the first time the API starts. The run is marked in `settings`,
 * so a later start never inserts a text again: an administrator who deletes an
 * unused standard type keeps it deleted, and an edited translation is never
 * overwritten. The demo seed of WP-M2-00 writes the same texts and stays
 * compatible with this bootstrap.
 */

export const STANDARD_TEXTS_BOOTSTRAP_KEY = 'standard_texts_bootstrap'

export type StandardTextsSeedResult = {
  status: 'created' | 'existing'
  templates: number
  translations: number
}

type Db = Database['database']

export async function seedStandardTexts(database: Db): Promise<StandardTextsSeedResult> {
  return database.transaction(async (tx) => {
    const marker = await tx
      .select({ key: schema.settings.key })
      .from(schema.settings)
      .where(eq(schema.settings.key, STANDARD_TEXTS_BOOTSTRAP_KEY))
      .limit(1)

    if (marker.length > 0) {
      return { status: 'existing', templates: 0, translations: 0 }
    }

    let templates = 0
    let translations = 0

    for (const key of STANDARD_TEXT_KEYS) {
      const inserted = await tx
        .insert(schema.textTemplates)
        .values({ key })
        .onConflictDoNothing({ target: schema.textTemplates.key })
        .returning({ id: schema.textTemplates.id })

      templates += inserted.length

      const [template] =
        inserted.length === 1
          ? inserted
          : await tx
              .select({ id: schema.textTemplates.id })
              .from(schema.textTemplates)
              .where(eq(schema.textTemplates.key, key))
              .limit(1)

      if (template === undefined) {
        throw new Error(`seed-standard-texts: template_missing ${key}`)
      }

      for (const locale of ['de', 'en'] as const) {
        const entry = STANDARD_TEXTS[locale].find((text) => text.key === key)

        if (entry === undefined) {
          throw new Error(`seed-standard-texts: missing_standard_text ${key}`)
        }

        const translated = await tx
          .insert(schema.textTemplateTranslations)
          .values({ templateId: template.id, locale, text: entry.text })
          .onConflictDoNothing({
            target: [
              schema.textTemplateTranslations.templateId,
              schema.textTemplateTranslations.locale,
            ],
          })
          .returning({ templateId: schema.textTemplateTranslations.templateId })

        translations += translated.length
      }
    }

    await tx.insert(schema.settings).values({
      key: STANDARD_TEXTS_BOOTSTRAP_KEY,
      value: { keys: [...STANDARD_TEXT_KEYS] },
    })

    return { status: 'created', templates, translations }
  })
}
