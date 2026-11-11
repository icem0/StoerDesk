import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedEscalation } from '../seed-escalation'
import { escalationRules, escalationStages, settings } from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
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

  it('inserts the five stages and the rules of the specification', async () => {
    const result = await seedEscalation(db as never)

    expect(result.status).toBe('created')
    expect(result.stages).toBe(5)
    expect(result.rules).toBe(8)

    const stages = await db.select().from(escalationStages)

    expect(stages.map((stage) => stage.key)).toEqual([
      'review',
      'work_order',
      'assignment',
      'acceptance',
      'acknowledgement',
    ])
    expect(stages[0]?.names).toMatchObject({ de: 'Prüfung', en: 'Review' })

    const rules = await db.select().from(escalationRules)

    expect(rules.map((rule) => rule.key)).toContain('deadline_exceeded')
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

    await db.delete(escalationRules).where(eq(escalationRules.key, 'review'))

    const result = await seedEscalation(db as never)

    expect(result.rules).toBe(1)

    const [review] = await db.select().from(escalationRules).where(eq(escalationRules.key, 'review'))

    expect(review?.minutes).toEqual({ low: 20, normal: 20, high: 20, critical: 7 })
  })
})
