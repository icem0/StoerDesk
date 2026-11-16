import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
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

    it('offers a stage that names a transition of the current status', async () => {
      await db
        .update(schema.escalationStages)
        .set({ reachedBy: ['assigned', 'offered', 'claimed'] })
        .where(eq(schema.escalationStages.key, 'assignment'))

      const stages = await readReachableStages(db, 'OFFERED')

      expect(stages.map((stage) => stage.key)).toEqual(['assignment', 'acceptance'])
      expect(stages[0]?.events).toEqual(['claimed'])
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

      const stages = await readReachableStages(db, 'NEW')

      expect(stages.map((stage) => stage.key)).not.toContain('no_event')
    })

    it('offers a stage only while its step is active', async () => {
      const step = and(
        eq(schema.ticketTransitions.fromStatus, 'NEW'),
        eq(schema.ticketTransitions.eventKey, 'review_started'),
      )

      await db.update(schema.ticketTransitions).set({ active: false }).where(step)

      expect(await readReachableStages(db, 'NEW')).toEqual([])

      await db.update(schema.ticketTransitions).set({ active: true }).where(step)

      expect((await readReachableStages(db, 'NEW'))[0]?.key).toBe('review')
    })

    it('offers a stage that names a step the administration added', async () => {
      const step = {
        fromStatus: 'NEW',
        toStatus: 'IN_REVIEW',
        eventKey: 'inspection_started',
      }

      await db.insert(schema.ticketTransitions).values(step)
      await db
        .update(schema.escalationStages)
        .set({ reachedBy: ['review_started', 'inspection_started'] })
        .where(eq(schema.escalationStages.key, 'review'))

      const stages = await readReachableStages(db, 'NEW')

      expect(stages[0]?.events).toEqual(['review_started', 'inspection_started'])

      await db
        .delete(schema.ticketTransitions)
        .where(
          and(
            eq(schema.ticketTransitions.fromStatus, step.fromStatus),
            eq(schema.ticketTransitions.eventKey, step.eventKey),
          ),
        )
      await db
        .update(schema.escalationStages)
        .set({ reachedBy: ['review_started'] })
        .where(eq(schema.escalationStages.key, 'review'))
    })
  },
)
