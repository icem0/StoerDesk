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

    it('offers the stage Prüfung with its event', async () => {
      const stages = await readReachableStages(db)
      const review = stages.find((stage) => stage.key === 'review')

      expect(review?.events).toEqual(['review_started'])
      expect(review?.names.de).toBe('Prüfung')
    })

    it('offers the stage Zuweisen oder Anbieten with its two events', async () => {
      const stages = await readReachableStages(db)
      const assignment = stages.find((stage) => stage.key === 'assignment')

      expect(assignment?.events).toEqual(['assigned', 'offered'])
    })

    it('does not depend on the status of a ticket', async () => {
      const first = await readReachableStages(db)
      const second = await readReachableStages(db)

      expect(second).toEqual(first)
    })

    it('never offers a stage with an empty reached_by', async () => {
      await db.insert(schema.escalationStages).values({
        key: 'no_event',
        names: { de: 'Ohne Ereignis', en: 'No event' },
        position: 30,
        active: true,
        predecessor: null,
        reachedBy: [],
      })

      const stages = await readReachableStages(db)

      expect(stages.map((stage) => stage.key)).not.toContain('no_event')
    })

    it('names the stage after the administration renamed it', async () => {
      await db
        .update(schema.escalationStages)
        .set({ names: { de: 'Prüfung durch das Büro', en: 'Office review' } })
        .where(eq(schema.escalationStages.key, 'review'))

      const stages = await readReachableStages(db)

      expect(stages.find((stage) => stage.key === 'review')?.names.de).toBe(
        'Prüfung durch das Büro',
      )
    })

    it('offers a stage with the workflow events the administration added to it', async () => {
      await db
        .update(schema.escalationStages)
        .set({ reachedBy: ['assigned', 'offered', 'claimed'] })
        .where(eq(schema.escalationStages.key, 'assignment'))

      const stages = await readReachableStages(db)

      expect(stages.find((stage) => stage.key === 'assignment')?.events).toEqual([
        'assigned',
        'offered',
        'claimed',
      ])
    })
  },
)
