import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
} from '@stoerdesk/shared'

import { seedEscalation } from '../seed-escalation'
import { escalationRules, escalationStages, settings } from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
}

/** The key of the seeded rule of a stage; the numbering is the identity (§7.5). */
function seededRuleKey(stageKey: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.stageKey === stageKey)

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of the stage ${stageKey}`)
  }

  return rule.key
}

describe.skipIf(testDatabase.status === 'unavailable')('the escalation seed (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema: { escalationStages, escalationRules, settings } })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('inserts the stages and the rules of the specification', async () => {
    const result = await seedEscalation(db as never)

    expect(result.status).toBe('created')
    expect(result.stages).toBe(DEFAULT_WORKFLOW_ESCALATION_STAGES.length)
    expect(result.rules).toBe(DEFAULT_WORKFLOW_ESCALATION_RULES.length)

    const stages = await db.select().from(escalationStages)

    expect(stages.map((stage) => stage.key)).toEqual(
      DEFAULT_WORKFLOW_ESCALATION_STAGES.map((stage) => stage.key),
    )
    expect(stages[0]?.names).toMatchObject(DEFAULT_WORKFLOW_ESCALATION_STAGES[0]?.names ?? {})

    const byKey = new Map(stages.map((stage) => [stage.key, stage]))

    for (const stage of DEFAULT_WORKFLOW_ESCALATION_STAGES) {
      expect(byKey.get(stage.key)?.predecessor).toBe(stage.predecessor)
      expect(byKey.get(stage.key)?.reachedBy).toEqual(stage.reachedBy)
    }

    const rules = await db.select().from(escalationRules)

    const conditionByKey = new Map(rules.map((rule) => [rule.key, rule.condition]))

    // Every row carries the timer of the table of §7.2 in its condition (ADR-0064).
    for (const rule of DEFAULT_WORKFLOW_ESCALATION_RULES) {
      expect(conditionByKey.get(rule.key)).toEqual(rule.condition)
    }

    expect(conditionByKey.get('deadline#2')).toEqual({
      all: [{ field: 'timer_expired', operator: 'expired', value: { percent: 100 } }],
    })
  })

  it('changes nothing on a second run', async () => {
    const result = await seedEscalation(db as never)

    expect(result.status).toBe('existing')
    expect(result.stages).toBe(0)
    expect(result.rules).toBe(0)
  })

  it('takes the former settings values over into the minutes of a rule', async () => {
    await db
      .insert(settings)
      .values({ key: 'ticket.escalation.new_without_review.minutes', value: 20 })
      .onConflictDoNothing({ target: settings.key })
    await db
      .insert(settings)
      .values({ key: 'ticket.escalation.new_without_review.critical_minutes', value: 7 })
      .onConflictDoNothing({ target: settings.key })

    await db
      .delete(escalationRules)
      .where(eq(escalationRules.key, seededRuleKey('review')))

    const result = await seedEscalation(db as never)

    expect(result.rules).toBe(1)

    const [review] = await db
      .select()
      .from(escalationRules)
      .where(eq(escalationRules.key, seededRuleKey('review')))

    expect(review?.condition).toEqual({
      all: [
        {
          field: 'timer_expired',
          operator: 'expired',
          value: { reference: 'received_at', minutes: { low: 20, normal: 20, high: 20, critical: 7 } },
        },
      ],
    })
  })
})
