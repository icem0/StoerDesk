import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { bmaSyncRuns, objects, tickets } from '../../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../../db/__tests__/helpers/testDatabase'
import { syncBmaAnlagen } from '../sync'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
}

const anlage = (overrides: Record<string, unknown> = {}) => ({
  aid: 'aid-1',
  nr: '10372_01',
  firma: 'Musterfirma GmbH',
  anlagenort: 'Haus A',
  str: 'Musterweg 1',
  plz: '10115',
  ort: 'Berlin',
  status: 'active',
  ...overrides,
})

describe.skipIf(testDatabase.status === 'unavailable')('syncBmaAnlagen (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const database = drizzle(client, { schema })

  beforeAll(async () => {
    await migrate(database, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('creates objects from a pull and records the run', async () => {
    const run = await syncBmaAnlagen(database, [
      anlage(),
      anlage({ aid: 'aid-2', nr: '10372_02', anlagenort: 'Haus B', str: null }),
    ])

    expect(run.status).toBe('SUCCESS')
    expect(run.total).toBe(2)
    expect(run.created).toBe(2)
    expect(run.updated).toBe(0)
    expect(run.unchanged).toBe(0)
    expect(run.deactivated).toBe(0)
    expect(run.conflicts).toEqual([])

    const [first] = await database
      .select()
      .from(objects)
      .where(eq(objects.objectNo, '10372_01'))

    expect(first).toMatchObject({
      name: 'Musterfirma GmbH – Haus A',
      street: 'Musterweg 1',
      postalCode: '10115',
      city: 'Berlin',
      active: true,
      externalId: 'aid-1',
    })
    expect(first?.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(first?.houseNumber).toBeNull()
    expect(first?.notes).toBeNull()

    const stored = await database
      .select()
      .from(bmaSyncRuns)
      .orderBy(desc(bmaSyncRuns.startedAt))
      .limit(1)

    expect(stored[0]?.status).toBe('SUCCESS')
    expect(stored[0]?.created).toBe(2)
    expect(stored[0]?.finishedAt).not.toBeNull()
  })

  it('counts an unchanged pull as unchanged and keeps local fields', async () => {
    await database
      .update(objects)
      .set({ notes: 'Schlüssel beim Hausmeister', contactName: 'Frau Muster' })
      .where(eq(objects.objectNo, '10372_01'))

    const before = await database.select().from(objects).where(eq(objects.objectNo, '10372_01'))

    const run = await syncBmaAnlagen(database, [
      anlage(),
      anlage({ aid: 'aid-2', nr: '10372_02', anlagenort: 'Haus B', str: null }),
    ])

    expect(run).toMatchObject({ status: 'SUCCESS', created: 0, updated: 0, unchanged: 2 })

    const after = await database.select().from(objects).where(eq(objects.objectNo, '10372_01'))

    expect(after[0]?.notes).toBe('Schlüssel beim Hausmeister')
    expect(after[0]?.contactName).toBe('Frau Muster')
    expect(after[0]?.qrToken).toBe(before[0]?.qrToken)
  })

  it('updates the BMAcloud fields of an object it owns', async () => {
    const run = await syncBmaAnlagen(database, [
      anlage({ firma: 'Neue Firma GmbH', str: 'Anderer Weg 2', status: 'inactive' }),
      anlage({ aid: 'aid-2', nr: '10372_02', anlagenort: 'Haus B', str: null }),
    ])

    expect(run.created).toBe(0)
    expect(run.updated).toBe(1)
    expect(run.unchanged).toBe(1)

    const [row] = await database.select().from(objects).where(eq(objects.objectNo, '10372_01'))

    expect(row).toMatchObject({
      name: 'Neue Firma GmbH – Haus A',
      street: 'Anderer Weg 2',
      active: false,
      externalId: 'aid-1',
      notes: 'Schlüssel beim Hausmeister',
    })
  })

  it('reports a local object with the same number as a conflict and never overwrites it', async () => {
    await database.insert(objects).values({ objectNo: '10372_03', name: 'Lokales Objekt' })

    const run = await syncBmaAnlagen(database, [
      anlage({ aid: 'aid-3', nr: '10372_03', firma: 'BMAcloud Firma' }),
    ])

    expect(run.status).toBe('PARTIAL')
    expect(run.created).toBe(0)
    expect(run.conflicts).toEqual([
      { code: 'object_no_taken', objectNo: '10372_03', aid: 'aid-3', detail: 'local_object' },
    ])

    const [row] = await database.select().from(objects).where(eq(objects.objectNo, '10372_03'))

    expect(row?.name).toBe('Lokales Objekt')
    expect(row?.externalId).toBeNull()
  })

  it('treats an object number with whitespace as an invalid conflict', async () => {
    const run = await syncBmaAnlagen(database, [
      anlage({ aid: 'aid-4', nr: '10372 04' }),
      anlage({ aid: 'aid-5', nr: '' }),
      { aid: 'aid-6' },
    ])

    expect(run.status).toBe('PARTIAL')
    expect(run.created).toBe(0)
    expect(run.conflicts.map((conflict) => [conflict.code, conflict.aid])).toEqual([
      ['invalid_object_no', 'aid-4'],
      ['invalid_object_no', 'aid-5'],
      ['invalid_object_no', 'aid-6'],
    ])
  })

  it('soft-deactivates objects that disappeared from the pull', async () => {
    await syncBmaAnlagen(database, [
      anlage(),
      anlage({ aid: 'aid-2', nr: '10372_02', anlagenort: 'Haus B', str: null }),
    ])

    const run = await syncBmaAnlagen(database, [
      anlage({ aid: 'aid-2', nr: '10372_02', anlagenort: 'Haus B', str: null }),
    ])

    expect(run.deactivated).toBe(1)

    const [gone] = await database.select().from(objects).where(eq(objects.objectNo, '10372_01'))

    expect(gone?.active).toBe(false)

    const [kept] = await database.select().from(objects).where(eq(objects.objectNo, '10372_02'))

    expect(kept?.active).toBe(true)
  })

  it('keeps tickets of a deactivated object', async () => {
    const [object] = await database
      .select()
      .from(objects)
      .where(eq(objects.objectNo, '10372_02'))

    if (object === undefined) {
      throw new Error('expected the synced object')
    }

    const now = new Date()

    await database.insert(tickets).values({
      objectId: object.id,
      reportedAt: now,
      deadlineAt: new Date(now.getTime() + 60_000),
    })

    await syncBmaAnlagen(database, [])

    const rows = await database.select().from(tickets).where(eq(tickets.objectId, object.id))

    expect(rows).toHaveLength(1)

    const [after] = await database.select().from(objects).where(eq(objects.id, object.id))

    expect(after?.active).toBe(false)
  })
})
