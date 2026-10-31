import { and, count, eq, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../schema'
import { seedDemo } from '../seed-demo'
import { seedRbac } from '../seed-rbac'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped demo seed integration: ${testDatabase.reason}\n`)
}

const { objects, systems, textTemplates, textTemplateTranslations } = schema

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

type Db = PostgresJsDatabase<typeof schema>

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

async function countRows(db: Db, table: PgTable): Promise<number> {
  const rows = await db.select({ value: count() }).from(table)

  return Number(onlyRow(rows, 'count').value)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'demo seed — objects, systems, standard texts (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 4 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('creates three objects with one BMA system each and nine localized templates', async () => {
      const first = await seedDemo(db)

      expect(first).toEqual({ objects: 3, systems: 3, templates: 9, translations: 18 })
      expect(await countRows(db, objects)).toBe(3)
      expect(await countRows(db, systems)).toBe(3)
      expect(await countRows(db, textTemplates)).toBe(9)
      expect(await countRows(db, textTemplateTranslations)).toBe(18)

      const localized = await db
        .select({ key: textTemplates.key })
        .from(textTemplates)
        .innerJoin(
          textTemplateTranslations,
          eq(textTemplateTranslations.templateId, textTemplates.id),
        )
        .groupBy(textTemplates.key)
        .having(sql`count(*) = 2`)

      expect(localized).toHaveLength(9)

      const demoSystems = await db.select({ type: systems.type }).from(systems)

      expect(demoSystems.every((row) => row.type === 'BMA')).toBe(true)

      const tokens = await db
        .select({ objectNo: objects.objectNo, qrToken: objects.qrToken })
        .from(objects)

      // WP-M2-02b: the demo seed no longer leaves `qr_token` NULL.
      expect(tokens).toHaveLength(3)
      expect(tokens.every((row) => QR_TOKEN_PATTERN.test(row.qrToken ?? ''))).toBe(true)
      expect(new Set(tokens.map((row) => row.qrToken)).size).toBe(3)
    })

    it('is a no-op on the second run', async () => {
      const second = await seedDemo(db)

      expect(second).toEqual({ objects: 0, systems: 0, templates: 0, translations: 0 })
      expect(await countRows(db, objects)).toBe(3)
      expect(await countRows(db, systems)).toBe(3)
      expect(await countRows(db, textTemplates)).toBe(9)
      expect(await countRows(db, textTemplateTranslations)).toBe(18)
    })

    it('keeps an edited translation on every later run', async () => {
      const templateRows = await db
        .select({ id: textTemplates.id })
        .from(textTemplates)
        .where(eq(textTemplates.key, 'bma.false_alarm'))
        .limit(1)

      await db
        .update(textTemplateTranslations)
        .set({ text: 'edited by the administrator' })
        .where(
          and(
            eq(textTemplateTranslations.templateId, onlyRow(templateRows, 'template').id),
            eq(textTemplateTranslations.locale, 'de'),
          ),
        )

      const translated = await db
        .select({ text: textTemplateTranslations.text })
        .from(textTemplateTranslations)
        .innerJoin(textTemplates, eq(textTemplates.id, textTemplateTranslations.templateId))
        .where(
          and(eq(textTemplates.key, 'bma.false_alarm'), eq(textTemplateTranslations.locale, 'de')),
        )

      expect(onlyRow(translated, 'translation').text).toBe('edited by the administrator')

      await seedDemo(db)

      const after = await db
        .select({ text: textTemplateTranslations.text })
        .from(textTemplateTranslations)
        .innerJoin(textTemplates, eq(textTemplates.id, textTemplateTranslations.templateId))
        .where(
          and(eq(textTemplates.key, 'bma.false_alarm'), eq(textTemplateTranslations.locale, 'de')),
        )

      expect(onlyRow(after, 'translation').text).toBe('edited by the administrator')
    })

    it('backfills a missing demo token and keeps an edited one', async () => {
      const demoRows = await db
        .select({ id: objects.id, qrToken: objects.qrToken })
        .from(objects)
        .orderBy(objects.objectNo)

      const edited = onlyRow(demoRows, 'demo object')
      const backfilled = onlyRow(demoRows.slice(1), 'second demo object')

      await db
        .update(objects)
        .set({ qrToken: 'edited_by_the_admin_x1' })
        .where(eq(objects.id, edited.id))
      await db.update(objects).set({ qrToken: null }).where(eq(objects.id, backfilled.id))

      const third = await seedDemo(db)

      expect(third).toEqual({ objects: 0, systems: 0, templates: 0, translations: 0 })

      const keptToken = await db
        .select({ qrToken: objects.qrToken })
        .from(objects)
        .where(eq(objects.id, edited.id))

      expect(onlyRow(keptToken, 'edited object').qrToken).toBe('edited_by_the_admin_x1')

      const newToken = await db
        .select({ qrToken: objects.qrToken })
        .from(objects)
        .where(eq(objects.id, backfilled.id))

      expect(QR_TOKEN_PATTERN.test(onlyRow(newToken, 'backfilled object').qrToken ?? '')).toBe(true)

      const tokens = await db.select({ qrToken: objects.qrToken }).from(objects)

      expect(new Set(tokens.map((row) => row.qrToken)).size).toBe(3)
    })

    it('rejects an unknown system type and an unsupported locale', async () => {
      const objectRows = await db.select({ id: objects.id }).from(objects).limit(1)

      await expect(
        db.insert(systems).values({
          objectId: onlyRow(objectRows, 'object').id,
          type: 'ELEVATOR',
          label: 'nope',
        }),
      ).rejects.toThrow()

      const templateRows = await db.select({ id: textTemplates.id }).from(textTemplates).limit(1)

      await expect(
        db
          .insert(textTemplateTranslations)
          .values({ templateId: onlyRow(templateRows, 'template').id, locale: 'fr', text: 'non' }),
      ).rejects.toThrow()
    })

    it('rejects a duplicated object_no, also when it differs only in case', async () => {
      await expect(
        db.insert(objects).values({ objectNo: '1001_01', name: 'duplicate' }),
      ).rejects.toThrow()

      await db.insert(objects).values({ objectNo: 'Ab-9001', name: 'case first' })

      await expect(
        db.insert(objects).values({ objectNo: 'aB-9001', name: 'case second' }),
      ).rejects.toThrow()

      await db.delete(objects).where(eq(objects.objectNo, 'Ab-9001'))
    })
  },
)
