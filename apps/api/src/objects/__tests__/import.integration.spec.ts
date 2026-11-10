import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CSV_IMPORT_MAX_ROWS } from '@stoerdesk/shared'
import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { applyObjectImport, previewObjectImport } from '../import'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped csv object import: ${testDatabase.reason}\n`)
}

const { objects } = schema

const csv = [
  'objektnummer;bezeichnung;strasse;hausnummer;plz;ort',
  'imp-001;Pump house;Musterweg;1;10115;Berlin',
  'IMP-002;Depot two;Kirchstraße;7;;Cologne',
  'IMP-003;;Musterweg 9',
  'IMP-001;Pump house renamed;Musterweg;1;10115;Berlin',
].join('\r\n')

describe.skipIf(testDatabase.status === 'unavailable')(
  'CSV object import service (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const database = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(database, { migrationsFolder })

      await database.insert(objects).values({
        objectNo: 'IMP-001',
        name: 'Pump house',
        street: 'Musterweg',
        houseNumber: '1',
        postalCode: '10115',
        city: 'Berlin',
        notes: 'local note',
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    const stored = async (objectNo: string) => {
      const [row] = await database.select().from(objects).where(eq(objects.objectNo, objectNo))

      return row
    }

    it('previews new, changed, unchanged and error rows and writes nothing', async () => {
      const preview = await previewObjectImport(database, { csv })

      expect(preview.summary).toEqual({ new: 1, changed: 1, unchanged: 1, error: 1 })
      expect(preview.rows.map((row) => row.action)).toEqual([
        'unchanged',
        'new',
        'error',
        'changed',
      ])
      expect(preview.rows.map((row) => row.line)).toEqual([2, 3, 4, 5])

      const invalid = preview.rows[2]

      expect(invalid?.objectNo).toBe('IMP-003')
      expect(invalid?.errors[0]?.params).toEqual({ fields: ['name'] })
      expect(preview.rows[3]?.changed).toEqual(['name'])

      expect(await stored('IMP-001')).toMatchObject({
        name: 'Pump house',
        notes: 'local note',
        qrToken: null,
      })
      expect(await stored('IMP-002')).toBeUndefined()
    })

    it('applies valid rows in one transaction and keeps unmapped fields', async () => {
      const result = await applyObjectImport(database, { csv })

      expect(result.applied).toEqual({ created: 1, updated: 1, unchanged: 1, failed: 1 })
      expect(result.rows.map((row) => row.action)).toEqual(['unchanged', 'new', 'error', 'changed'])

      expect(await stored('IMP-001')).toMatchObject({
        name: 'Pump house renamed',
        notes: 'local note',
      })

      const created = await stored('IMP-002')

      expect(created).toMatchObject({
        name: 'Depot two',
        street: 'Kirchstraße',
        postalCode: null,
        city: 'Cologne',
      })
      expect(created?.qrToken ?? '').toMatch(/^[A-Za-z0-9_-]{22}$/)
    })

    it('reports unchanged for a second identical import and writes nothing', async () => {
      const repeated =
        'objektnummer;bezeichnung;ort\nIMP-002;Depot two;Cologne\nIMP-001;Pump house renamed;Berlin'

      const first = await stored('IMP-001')
      const second = await stored('IMP-002')

      const preview = await previewObjectImport(database, { csv: repeated })

      expect(preview.summary).toEqual({ new: 0, changed: 0, unchanged: 2, error: 0 })

      const result = await applyObjectImport(database, { csv: repeated })

      expect(result.applied).toEqual({ created: 0, updated: 0, unchanged: 2, failed: 0 })
      expect((await stored('IMP-001'))?.updatedAt?.getTime()).toBe(first?.updatedAt?.getTime())
      expect((await stored('IMP-002'))?.updatedAt?.getTime()).toBe(second?.updatedAt?.getTime())
    })

    it('rejects a duplicate header and an over-limit row count with invalid_request', async () => {
      const invalidDocuments = [
        'objectNo;name;name\nA-9;B;C',
        `objectNo;name\n${'A-9;x\n'.repeat(CSV_IMPORT_MAX_ROWS + 1)}`,
      ]

      for (const invalid of invalidDocuments) {
        try {
          await previewObjectImport(database, { csv: invalid })
          expect(false).toBe(true)
        } catch (error) {
          expect((error as { code: string }).code).toBe('invalid_request')
          expect((error as { params: Record<string, unknown> }).params).toEqual({ fields: ['csv'] })
        }
      }
    })
  },
)
