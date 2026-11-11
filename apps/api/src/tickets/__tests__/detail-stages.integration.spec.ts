import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { readReachableStages } from '../../escalation/config'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped reachable stages integration: ${testDatabase.reason}\n`)
}

const { objects } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the reachable stages of a ticket (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      await db.insert(objects).values({
        objectNo: `STG-${randomUUID().slice(0, 6)}`,
        name: 'Stage probe',
      })

    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('offers the stage Prüfung for a new ticket', async () => {
      const stages = await readReachableStages(db, 'NEW')

      expect(stages).toHaveLength(1)
      expect(stages[0]?.key).toBe('review')
      expect(stages[0]?.events).toEqual(['review_started'])
      expect(stages[0]?.names.de).toBe('Prüfung')
    })

    it('offers the two variants of the stage Zuweisen oder Anbieten', async () => {
      const stages = await readReachableStages(db, 'WORK_ORDER_CREATED')

      expect(stages[0]?.key).toBe('assignment')
      expect(stages[0]?.events).toEqual(['assigned', 'offered'])
    })

    it('offers the stage Angenommen for an offered and for an assigned ticket', async () => {
      const offered = await readReachableStages(db, 'OFFERED')
      const assigned = await readReachableStages(db, 'ASSIGNED')

      expect(offered[0]?.key).toBe('acceptance')
      expect(assigned[0]?.key).toBe('acceptance')
    })

    it('offers nothing for an acknowledged, a closed and a cancelled ticket', async () => {
      expect(await readReachableStages(db, 'ACKNOWLEDGED')).toEqual([])
      expect(await readReachableStages(db, 'CLOSED')).toEqual([])
      expect(await readReachableStages(db, 'CANCELLED')).toEqual([])
    })

    it('names the stage after the administration renamed it', async () => {
      await db
        .update(schema.escalationStages)
        .set({ names: { de: 'Prüfung durch das Büro', en: 'Office review' } })
        .where(eq(schema.escalationStages.key, 'review'))

      const stages = await readReachableStages(db, 'NEW')

      expect(stages[0]?.names.de).toBe('Prüfung durch das Büro')
    })
  },
)
