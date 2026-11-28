import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../__tests__/helpers/testDatabase'
import * as schema from '../schema'
import { seedEscalation } from '../seed-escalation'

/**
 * The waiting clock of a rule becomes a condition (ADR-0064, WP-M45-02,
 * `specs/07-escalation.md` §7.2, §7.6): the migration
 * `0069_escalation_rule_timer.sql` turns the former columns `reference`,
 * `minutes` and `percent` of every rule into a `timer_expired` leaf of its
 * condition and drops them. The test rebuilds the columns of an installation
 * before the migration, writes the old clocks, runs the statements of the
 * migration and proves the conditions, the untouched keys, actions and firing
 * log and the dropped columns. The migration drops the rebuilt columns again,
 * so the database of the pool keeps its schema.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped rule timer migration integration: ${testDatabase.reason}\n`)
}

const { escalationActions, escalationFirings, escalationRules, escalationStages, objects, tickets } =
  schema

const ADR_0008 = { low: 15, normal: 15, high: 15, critical: 5 }
const EVEN_30 = { low: 30, normal: 30, high: 30, critical: 30 }
const PRIORITY = { field: 'priority', operator: 'in', value: ['critical'] }

function timer(value: unknown) {
  return { field: 'timer_expired', operator: 'expired', value }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the rule timer migration (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })
    let ticketId = ''

    /** Writes the old clock of a rule into the rebuilt columns. */
    async function oldClock(
      key: string,
      reference: string | null,
      minutes: Record<string, number> | null,
      percent: number | null,
      condition: unknown,
    ): Promise<void> {
      await db.execute(
        sql`UPDATE "escalation_rules" SET "reference" = ${reference}, "minutes" = ${
          minutes === null ? null : JSON.stringify(minutes)
        }::jsonb, "percent" = ${percent}, "condition" = ${JSON.stringify(condition)}::jsonb WHERE "key" = ${key}`,
      )
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      // The state before the migration: the columns of the old clock.
      await db.execute(
        sql.raw(
          'ALTER TABLE "escalation_rules" ADD COLUMN IF NOT EXISTS "reference" text, ADD COLUMN IF NOT EXISTS "minutes" jsonb, ADD COLUMN IF NOT EXISTS "percent" integer',
        ),
      )

      await oldClock('new#1', 'received_at', ADR_0008, null, { all: [] })
      // A rule without an explicit reference waits from the clock of its stage.
      await oldClock('work_order#1', null, EVEN_30, null, { all: [PRIORITY] })
      await oldClock('assignment#1', 'work_order_set', EVEN_30, null, { any: [PRIORITY] })
      await oldClock('acceptance#1', 'offered', ADR_0008, null, {})
      await oldClock('deadline#1', null, null, 80, { all: [] })
      await oldClock('deadline#2', null, null, 100, { all: [timer({ percent: 90 })] })

      await db.insert(escalationStages).values({
        key: 'silent',
        names: { de: 'Ohne Uhr', en: 'No clock' },
        position: 20,
        active: true,
        predecessor: 'acknowledgement',
        reachedBy: [],
      })
      await db.insert(escalationRules).values({
        key: 'silent#1',
        stageKey: 'silent',
        condition: { all: [] },
        position: 30,
        active: true,
      })

      await db.insert(escalationActions).values({
        key: 'review#1#1',
        ruleKey: 'review#1',
        type: 'history',
        config: { text: 'Prüfung überfällig' },
        condition: { all: [] },
        position: 0,
        active: true,
      })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `TMR-${randomUUID().slice(0, 6)}`, name: 'Timer migration probe' })
        .returning({ id: objects.id })
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'NEW',
          priority: 'normal',
          reportedAt: new Date('2026-11-27T08:00:00Z'),
          receivedAt: new Date('2026-11-27T08:00:00Z'),
          deadlineAt: new Date('2026-11-27T12:00:00Z'),
        })
        .returning({ id: tickets.id })

      ticketId = ticket?.id ?? ''

      await db.insert(escalationFirings).values({
        ticketId,
        ruleKey: 'review#1',
        stageKey: 'review',
        thresholdAt: new Date('2026-11-27T08:15:00Z'),
      })

      await runTimerMigration(db)
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function conditionOf(key: string): Promise<unknown> {
      const [row] = await db
        .select({ condition: escalationRules.condition })
        .from(escalationRules)
        .where(eq(escalationRules.key, key))

      return row?.condition
    }

    it('turns the old clock of a stage rule into its timer', async () => {
      expect(await conditionOf('new#1')).toEqual({
        all: [timer({ reference: 'received_at', minutes: ADR_0008 })],
      })
      expect(await conditionOf('acceptance#1')).toEqual({
        all: [timer({ reference: 'offered', minutes: ADR_0008 })],
      })
    })

    it('starts a rule without a reference at the clock of its stage and keeps its condition', async () => {
      expect(await conditionOf('work_order#1')).toEqual({
        all: [timer({ reference: 'review_started', minutes: EVEN_30 }), PRIORITY],
      })
      expect(await conditionOf('assignment#1')).toEqual({
        all: [timer({ reference: 'work_order_set', minutes: EVEN_30 }), { any: [PRIORITY] }],
      })
    })

    it('turns the percentage of a deadline rule into a percent timer', async () => {
      expect(await conditionOf('deadline#1')).toEqual({ all: [timer({ percent: 80 })] })
      // A condition that already carries a timer stays as it is.
      expect(await conditionOf('deadline#2')).toEqual({ all: [timer({ percent: 90 })] })
    })

    it('leaves a rule without a clock without a timer', async () => {
      expect(await conditionOf('silent#1')).toEqual({ all: [] })
    })

    it('keeps the keys, the actions and the firing log', async () => {
      const keys = (await db.select({ key: escalationRules.key }).from(escalationRules)).map(
        (row) => row.key,
      )

      expect(keys).toEqual(
        expect.arrayContaining(['new#1', 'review#1', 'deadline#1', 'deadline#2', 'silent#1']),
      )

      const actions = await db
        .select({ key: escalationActions.key, ruleKey: escalationActions.ruleKey })
        .from(escalationActions)

      expect(actions).toContainEqual({ key: 'review#1#1', ruleKey: 'review#1' })

      const firings = await db
        .select({ ruleKey: escalationFirings.ruleKey })
        .from(escalationFirings)
        .where(eq(escalationFirings.ticketId, ticketId))

      expect(firings).toEqual([{ ruleKey: 'review#1' }])
    })

    it('drops the columns of the old clock and their check', async () => {
      const columns = await db.execute<{ column_name: string }>(
        sql`SELECT "column_name" FROM information_schema.columns WHERE "table_name" = 'escalation_rules'`,
      )
      const names = [...columns].map((row) => row.column_name)

      expect(names).toEqual(expect.arrayContaining(['key', 'stage_key', 'condition']))
      expect(names).not.toContain('reference')
      expect(names).not.toContain('minutes')
      expect(names).not.toContain('percent')

      const checks = await db.execute<{ conname: string }>(
        sql`SELECT "conname" FROM pg_constraint WHERE "conname" = 'escalation_rules_clock_check'`,
      )

      expect([...checks]).toEqual([])
    })
  },
)

/** Runs the statements of the migration `0069` on the database. */
async function runTimerMigration(db: ReturnType<typeof drizzle>): Promise<void> {
  const file = path.join(migrationsFolder, '0069_escalation_rule_timer.sql')
  const statements = await readFile(file, 'utf8')

  for (const statement of statements.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()

    if (trimmed !== '') {
      await db.execute(trimmed)
    }
  }
}
