import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { STANDARD_TEXT_KEYS } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'
import * as schema from '../schema'
import { seedStandardTexts, STANDARD_TEXTS_BOOTSTRAP_KEY } from '../seed-standard-texts'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped standard texts seed integration: ${testDatabase.reason}\n`)
}

const { settings, textTemplates, textTemplateTranslations } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

async function countRows(
  database: ReturnType<typeof drizzle>,
  table: typeof textTemplates | typeof textTemplateTranslations,
) {
  const rows = await database.select().from(table)

  return rows.length
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'standard texts bootstrap seed (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('inserts the eight standard templates with both translations', async () => {
      const result = await seedStandardTexts(db)

      expect(result).toEqual({ status: 'created', templates: 8, translations: 16 })
      expect(await countRows(db, textTemplates)).toBe(8)
      expect(await countRows(db, textTemplateTranslations)).toBe(16)

      const keys = await db.select({ key: textTemplates.key }).from(textTemplates)

      expect(keys.map((row) => row.key).sort()).toEqual([...STANDARD_TEXT_KEYS].sort())
    })

    it('is a no-op on the second run', async () => {
      const result = await seedStandardTexts(db)

      expect(result).toEqual({ status: 'existing', templates: 0, translations: 0 })
      expect(await countRows(db, textTemplates)).toBe(8)
    })

    it('does not resurrect a deleted standard type', async () => {
      const template = onlyRow(
        await db
          .select({ id: textTemplates.id })
          .from(textTemplates)
          .where(eq(textTemplates.key, 'bma.false_alarm'))
          .limit(1),
        'template',
      )

      await db.delete(textTemplates).where(eq(textTemplates.id, template.id))

      await seedStandardTexts(db)

      expect(await countRows(db, textTemplates)).toBe(7)
    })

    it('marks the run in the settings table', async () => {
      const marker = await db
        .select({ key: settings.key })
        .from(settings)
        .where(eq(settings.key, STANDARD_TEXTS_BOOTSTRAP_KEY))
        .limit(1)

      expect(marker.map((row) => row.key)).toEqual([STANDARD_TEXTS_BOOTSTRAP_KEY])
    })
  },
)
