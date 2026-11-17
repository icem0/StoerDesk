import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_STAGES } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../__tests__/helpers/testDatabase'
import * as schema from '../schema'
import { seedEscalation } from '../seed-escalation'

/**
 * The stage `new` (WP-M14-116, `specs/07-escalation.md` §7.1): an installed
 * chain gets the stage of the arrival as its first stage. The test rebuilds
 * the chain of an installation without the stage, runs the statements of the
 * migration `0046_escalation_stage_new.sql` and proves the new anchor. A
 * second run and a chain that reached the position limit stay untouched.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped stage new migration integration: ${testDatabase.reason}\n`)
}

const { escalationRules, escalationStages } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the stage new migration (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function installedChainWithoutNewStage() {
      await db
        .delete(escalationStages)
        .where(eq(escalationStages.key, 'new'))
      await db
        .update(escalationStages)
        .set({ predecessor: null })
        .where(eq(escalationStages.key, 'review'))
      await db
        .update(escalationStages)
        .set({ position: 1 })
        .where(eq(escalationStages.key, 'review'))
      await db
        .update(escalationStages)
        .set({ position: 2 })
        .where(eq(escalationStages.key, 'work_order'))
      await db
        .update(escalationStages)
        .set({ position: 3 })
        .where(eq(escalationStages.key, 'assignment'))
      await db
        .update(escalationStages)
        .set({ position: 4 })
        .where(eq(escalationStages.key, 'acceptance'))
      await db
        .update(escalationStages)
        .set({ position: 5 })
        .where(eq(escalationStages.key, 'acknowledgement'))
    }

    it('anchors the installed chain at the stage new', async () => {
      await installedChainWithoutNewStage()

      await runStageNewMigration(db)

      const stages = await db.select().from(escalationStages)
      const byKey = new Map(stages.map((stage) => [stage.key, stage]))
      const ordered = [...stages].sort((a, b) => a.position - b.position)

      expect(ordered.map((stage) => stage.key)).toEqual(
        DEFAULT_WORKFLOW_ESCALATION_STAGES.map((stage) => stage.key),
      )
      expect(ordered.map((stage) => stage.position)).toEqual(
        DEFAULT_WORKFLOW_ESCALATION_STAGES.map((stage) => stage.position),
      )
      expect(byKey.get('new')?.names).toMatchObject({ de: 'Neu', en: 'New' })
      expect(byKey.get('new')?.predecessor).toBeNull()
      expect(byKey.get('new')?.reachedBy).toEqual([])
      expect(byKey.get('review')?.predecessor).toBe('new')

      const rules = await db.select().from(escalationRules)
      const newRule = rules.find((rule) => rule.key === 'new#1')

      expect(newRule?.stageKey).toBe('new')
      expect(newRule?.reference).toBe('received_at')
      expect(newRule?.minutes).toEqual({ low: 15, normal: 15, high: 15, critical: 5 })
      expect(rules.find((rule) => rule.key === 'review#1')?.reference).toBe('received_at')
    })

    it('changes nothing when the chain already knows the stage', async () => {
      const before = await db.select().from(escalationStages)

      await runStageNewMigration(db)

      const after = await db.select().from(escalationStages)

      expect(after.map((stage) => `${stage.key}@${stage.position}`)).toEqual(
        before.map((stage) => `${stage.key}@${stage.position}`),
      )
    })

    it('leaves a chain that reached the position limit alone', async () => {
      await installedChainWithoutNewStage()

      await db
        .update(escalationStages)
        .set({ position: 20 })
        .where(eq(escalationStages.key, 'acknowledgement'))

      await runStageNewMigration(db)

      const stages = await db.select().from(escalationStages)

      expect(stages.map((stage) => stage.key)).not.toContain('new')
    })
  },
)

/** Runs the statements of the migration `0046` on the database. */
async function runStageNewMigration(db: ReturnType<typeof drizzle>): Promise<void> {
  const file = path.join(migrationsFolder, '0046_escalation_stage_new.sql')
  const sql = await readFile(file, 'utf8')

  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()

    if (trimmed !== '') {
      await db.execute(trimmed)
    }
  }
}
