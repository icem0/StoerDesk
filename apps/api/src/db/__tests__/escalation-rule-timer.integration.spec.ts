import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../__tests__/helpers/testDatabase'
import * as schema from '../schema'
import { seedEscalation } from '../seed-escalation'

/**
 * The waiting clock becomes a condition (WP-M45-02, ADR-0064 decision 8): the
 * test gives a migrated database the three former columns back, writes the
 * rules of an installation before `0069` — the seed of ADR-0008 in the old
 * fields, a rule on the clock of its stage, a deadline rule with a condition of
 * its own — runs the statements of `0069_escalation_rule_timer.sql` and proves
 * the timers in the conditions, the untouched keys and firing log and the
 * columns that are gone.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation rule timer migration: ${testDatabase.reason}\n`)
}

const { escalationFirings, escalationRules } = schema

const minutes15 = { low: 15, normal: 15, high: 15, critical: 5 }
const minutes30 = { low: 30, normal: 30, high: 30, critical: 30 }

function timer(value: unknown) {
  return { field: 'timer_expired', operator: 'expired', value }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the escalation rule timer migration (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)
      await installationBefore0069()
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    /** The rules of an installation in the shape before `0069`. */
    async function installationBefore0069() {
      await db.execute(
        sql.raw(`
        ALTER TABLE "escalation_rules" ADD COLUMN "reference" text;
        ALTER TABLE "escalation_rules" ADD COLUMN "minutes" jsonb;
        ALTER TABLE "escalation_rules" ADD COLUMN "percent" integer;
      `),
      )

      const clocks: Record<string, [string | null, unknown, number | null]> = {
        'new#1': ['received_at', minutes15, null],
        'review#1': ['received_at', minutes15, null],
        'work_order#1': [null, minutes30, null],
        'assignment#1': ['work_order_set', minutes30, null],
        'acceptance#1': ['offered', { low: 20, normal: 20, high: 20, critical: 10 }, null],
        'acceptance#2': ['assigned', { low: 15, normal: 15, high: 15, critical: 15 }, null],
        'acknowledgement#1': ['accepted', { low: 60, normal: 60, high: 60, critical: 60 }, null],
        'deadline#1': [null, null, 80],
        'deadline#2': [null, null, 100],
      }

      for (const [key, [reference, minutes, percent]] of Object.entries(clocks)) {
        await db.execute(
          sql`UPDATE "escalation_rules" SET "reference" = ${reference}, "minutes" = ${
            minutes === null ? null : JSON.stringify(minutes)
          }::jsonb, "percent" = ${percent}, "condition" = '{"all":[]}'::jsonb WHERE "key" = ${key}`,
        )
      }

      // A deadline rule that already had a condition of its own.
      await db.execute(
        sql`UPDATE "escalation_rules" SET "condition" = '{"all":[{"field":"priority","operator":"eq","value":"critical"}]}'::jsonb WHERE "key" = 'deadline#1'`,
      )
      // A rule whose condition is a single leaf, not a group.
      await db.execute(
        sql`UPDATE "escalation_rules" SET "condition" = '{"field":"assigned","operator":"eq","value":true}'::jsonb WHERE "key" = 'acknowledgement#1'`,
      )

      const [ticket] = await client`
        SELECT "id" FROM "tickets" LIMIT 1
      `

      if (ticket !== undefined) {
        await db.insert(escalationFirings).values({
          ticketId: ticket.id as string,
          ruleKey: 'review#1',
          stageKey: 'review',
          thresholdAt: new Date('2026-11-27T10:00:00.000Z'),
        })
      }
    }

    it('turns the clock of every rule into a timer of its condition', async () => {
      const firingsBefore = await db.select().from(escalationFirings)

      await runRuleTimerMigration(db)

      const rules = await db.select().from(escalationRules)
      const byKey = new Map(rules.map((rule) => [rule.key, rule.condition]))

      expect(byKey.get('new#1')).toEqual({
        all: [timer({ reference: 'received_at', minutes: minutes15 })],
      })
      expect(byKey.get('assignment#1')).toEqual({
        all: [timer({ reference: 'work_order_set', minutes: minutes30 })],
      })
      // The rule on the clock of its stage takes the event of its predecessor.
      expect(byKey.get('work_order#1')).toEqual({
        all: [timer({ reference: 'review_started', minutes: minutes30 })],
      })
      expect(byKey.get('deadline#2')).toEqual({ all: [timer({ percent: 100 })] })
      // An old condition merges with the timer into one `all` group.
      expect(byKey.get('deadline#1')).toEqual({
        all: [timer({ percent: 80 }), { field: 'priority', operator: 'eq', value: 'critical' }],
      })
      expect(byKey.get('acknowledgement#1')).toEqual({
        all: [
          timer({
            reference: 'accepted',
            minutes: { low: 60, normal: 60, high: 60, critical: 60 },
          }),
          { field: 'assigned', operator: 'eq', value: true },
        ],
      })

      expect([...byKey.keys()].sort()).toEqual(
        [
          'acceptance#1',
          'acceptance#2',
          'acknowledgement#1',
          'assignment#1',
          'deadline#1',
          'deadline#2',
          'new#1',
          'review#1',
          'work_order#1',
        ].sort(),
      )

      const firingsAfter = await db.select().from(escalationFirings)

      expect(firingsAfter).toEqual(firingsBefore)
    })

    it('drops the three columns of the old clock', async () => {
      const columns = await client`
        SELECT "column_name" FROM "information_schema"."columns"
        WHERE "table_name" = 'escalation_rules'
      `
      const names = columns.map((column) => column.column_name as string)

      expect(names).not.toContain('reference')
      expect(names).not.toContain('minutes')
      expect(names).not.toContain('percent')
      expect(names).toContain('condition')

      const [review] = await db
        .select({ key: escalationRules.key })
        .from(escalationRules)
        .where(eq(escalationRules.key, 'review#1'))

      expect(review?.key).toBe('review#1')
    })
  },
)

/** Runs the statements of the migration `0069` on the database. */
async function runRuleTimerMigration(db: ReturnType<typeof drizzle>): Promise<void> {
  const file = path.join(migrationsFolder, '0069_escalation_rule_timer.sql')
  const text = await readFile(file, 'utf8')

  for (const statement of text.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()

    if (trimmed !== '') {
      await db.execute(sql.raw(trimmed))
    }
  }
}
