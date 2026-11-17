import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_RULES } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../__tests__/helpers/testDatabase'
import * as schema from '../schema'
import { seedEscalation } from '../seed-escalation'

/**
 * The numbering of the rules and their actions (WP-M14-99, `specs/07-escalation.md`
 * §7.5): the migration `0045_escalation_rule_numbering.sql` gives every rule
 * the key of its stage and its number and every action the key of its rule and
 * its number. The test builds the state before the migration, runs the
 * statements of the migration and proves the numbering.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped rule numbering migration integration: ${testDatabase.reason}\n`)
}

const {
  escalationActions,
  escalationFirings,
  escalationRules,
  escalationStages,
  objects,
  tickets,
} = schema

/** The key of a rule before the numbering. */
const LEGACY_KEY_BY_NUMBERED_KEY: Record<string, string> = {
  'review#1': 'review',
  'work_order#1': 'work_order',
  'assignment#1': 'assignment',
  'acceptance#1': 'acceptance_offer',
  'acceptance#2': 'acceptance_assignment',
  'acknowledgement#1': 'acknowledgement',
  'deadline#1': 'deadline_80_percent',
  'deadline#2': 'deadline_exceeded',
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the numbering of the rules (integration)',
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

    it('numbers the rules, their actions and the firing log', async () => {
      const [object] = await db
        .insert(objects)
        .values({ objectNo: `NUM-${randomUUID().slice(0, 6)}`, name: 'Numbering probe' })
        .returning({ id: objects.id })

      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'NEW',
          priority: 'normal',
          reportedAt: new Date(),
          receivedAt: new Date(),
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .returning({ id: tickets.id })

      // The state before the migration: the free keys of the rules, an action
      // of the review rule and a firing of the same rule.
      for (const [numbered, legacy] of Object.entries(LEGACY_KEY_BY_NUMBERED_KEY)) {
        await db
          .update(escalationRules)
          .set({ key: legacy })
          .where(eq(escalationRules.key, numbered))
      }

      await db.insert(escalationActions).values({
        key: 'office_ntfy',
        ruleKey: 'review',
        type: 'notify',
        config: { channels: ['ntfy'] },
        condition: { all: [] },
        position: 0,
        active: true,
      })

      await db.insert(escalationFirings).values({
        ticketId: ticket?.id ?? '',
        ruleKey: 'review',
        stageKey: 'review',
        thresholdAt: new Date(),
      })

      await runNumberingMigration(db)

      const rules = await db.select().from(escalationRules)

      expect(rules.map((rule) => rule.key).sort()).toEqual(
        DEFAULT_WORKFLOW_ESCALATION_RULES.map((rule) => rule.key).sort(),
      )

      const stages = await db.select().from(escalationStages)

      expect(stages.map((stage) => stage.key)).toContain('review')

      const actions = await db.select().from(escalationActions)

      expect(actions).toHaveLength(1)
      expect(actions[0]?.key).toBe('review#1#1')
      expect(actions[0]?.ruleKey).toBe('review#1')

      const firings = await db.select().from(escalationFirings)

      expect(firings).toHaveLength(1)
      expect(firings[0]?.ruleKey).toBe('review#1')
    })
  },
)

/** Runs the statements of the migration `0045` on the database. */
async function runNumberingMigration(db: ReturnType<typeof drizzle>): Promise<void> {
  const file = path.join(migrationsFolder, '0045_escalation_rule_numbering.sql')
  const sql = await readFile(file, 'utf8')

  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()

    if (trimmed !== '') {
      await db.execute(trimmed)
    }
  }
}
