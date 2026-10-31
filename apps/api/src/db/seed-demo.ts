import { and, eq, sql } from 'drizzle-orm'

import { STANDARD_TEXT_KEYS, STANDARD_TEXTS } from '@stoerdesk/shared'

import { loadDotEnvFile } from '../config/env'
import { generateQrToken } from '../objects/qr'
import { createDatabase, type Database } from './client'
import * as schema from './schema'

/**
 * Counts of rows this seed run really inserted. A second run is a no-op and
 * reports zeros, because the natural keys (`objects.object_no` case
 * insensitively, `systems` per object and type, `text_templates.key`) decide
 * existence. Edits made in the admin UI are never overwritten.
 */
export type DemoSeedResult = {
  objects: number
  systems: number
  templates: number
  translations: number
}

type DemoDatabase = Database['database']

/** Three example objects with one `BMA` system each (`specs/02` §4.3). */
const DEMO_OBJECTS = [
  {
    objectNo: '1001_01',
    name: 'Musterstraße 1',
    street: 'Musterstraße',
    houseNumber: '1',
    postalCode: '12345',
    city: 'Musterstadt',
  },
  {
    objectNo: '1002_01',
    name: 'Musterstraße 2',
    street: 'Musterstraße',
    houseNumber: '2',
    postalCode: '12345',
    city: 'Musterstadt',
  },
  {
    objectNo: '1003_01',
    name: 'Musterstraße 3',
    street: 'Musterstraße',
    houseNumber: '3',
    postalCode: '12345',
    city: 'Musterstadt',
  },
] as const

const DEMO_SYSTEM_TYPE = 'BMA'
const DEMO_SYSTEM_LABEL = 'BMA'

/**
 * Idempotent demo seed of the object list and the standard text templates
 * (`work-packages/m2/00-core-tables-seed.md` §4/§5, `specs/02-data-model.md`
 * §4.3–§4.5). Every demo object it inserts carries a generated `qr_token`, an
 * existing demo object with a `NULL` token is backfilled (WP-M2-02b) and an
 * existing token is never touched, so an administrator's edits survive every
 * run.
 */
export async function seedDemo(database: DemoDatabase): Promise<DemoSeedResult> {
  return database.transaction(async (tx) => {
    let objects = 0
    let systems = 0

    for (const demo of DEMO_OBJECTS) {
      const [existing] = await tx
        .select({ id: schema.objects.id, qrToken: schema.objects.qrToken })
        .from(schema.objects)
        .where(sql`lower(${schema.objects.objectNo}) = lower(${demo.objectNo})`)
        .limit(1)

      const objectId =
        existing?.id ??
        (
          await tx
            .insert(schema.objects)
            .values({ ...demo, qrToken: generateQrToken() })
            .onConflictDoNothing()
            .returning({ id: schema.objects.id })
        )[0]?.id

      if (objectId === undefined) {
        continue
      }

      if (existing === undefined) {
        objects += 1
      } else if (existing.qrToken === null) {
        // Backfill of WP-M2-02b: a demo object that still has no token gets one.
        // A non-null token is a decision (generated or edited) and stays as it is.
        await tx
          .update(schema.objects)
          .set({ qrToken: generateQrToken() })
          .where(eq(schema.objects.id, existing.id))
      }

      const [existingSystem] = await tx
        .select({ id: schema.systems.id })
        .from(schema.systems)
        .where(
          and(eq(schema.systems.objectId, objectId), eq(schema.systems.type, DEMO_SYSTEM_TYPE)),
        )
        .limit(1)

      if (existingSystem === undefined) {
        const inserted = await tx
          .insert(schema.systems)
          .values({ objectId, type: DEMO_SYSTEM_TYPE, label: DEMO_SYSTEM_LABEL })
          .onConflictDoNothing()
          .returning({ id: schema.systems.id })

        systems += inserted.length
      }
    }

    let templates = 0
    let translations = 0

    for (const key of STANDARD_TEXT_KEYS) {
      const insertedTemplate = await tx
        .insert(schema.textTemplates)
        .values({ key })
        .onConflictDoNothing({ target: schema.textTemplates.key })
        .returning({ id: schema.textTemplates.id })

      templates += insertedTemplate.length

      const [template] =
        insertedTemplate.length === 1
          ? insertedTemplate
          : await tx
              .select({ id: schema.textTemplates.id })
              .from(schema.textTemplates)
              .where(eq(schema.textTemplates.key, key))
              .limit(1)

      if (template === undefined) {
        continue
      }

      for (const locale of ['de', 'en'] as const) {
        const entry = STANDARD_TEXTS[locale].find((text) => text.key === key)

        if (entry === undefined) {
          throw new Error(`seed-demo: missing_standard_text ${key}`)
        }

        const inserted = await tx
          .insert(schema.textTemplateTranslations)
          .values({ templateId: template.id, locale, text: entry.text })
          .onConflictDoNothing({
            target: [
              schema.textTemplateTranslations.templateId,
              schema.textTemplateTranslations.locale,
            ],
          })
          .returning({ templateId: schema.textTemplateTranslations.templateId })

        translations += inserted.length
      }
    }

    return { objects, systems, templates, translations }
  })
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed-demo.ts') === true ||
  process.argv[1]?.endsWith('seed-demo.js') === true

if (invokedDirectly) {
  loadDotEnvFile()

  const { client, database } = createDatabase()

  try {
    const result = await seedDemo(database)

    // Counts only: the demo seed is not user data and never logs rows.
    process.stdout.write(`${JSON.stringify({ seed: 'demo', ...result })}\n`)
  } finally {
    await client.end()
  }
}
