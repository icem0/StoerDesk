import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { loadEnv, type Env } from '../../config/env'
import { enqueueOncallReminders } from '../coupling'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped unconfirmed readiness reminder integration: ${testDatabase.reason}\n`)
}

const { oncallPools, oncallShifts, outbox, users } = schema

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const HOUR = 60 * 60 * 1000
const now = new Date('2026-11-05T12:00:00.000Z')

describe.skipIf(testDatabase.status === 'unavailable')(
  'unconfirmed readiness reminder (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let poolId = ''
    let firstTechId = ''
    let secondTechId = ''

    const env = ((): Env =>
      loadEnv({
        NTFY_URL: 'https://ntfy.example.invalid/',
        NTFY_TOPIC: 'instance-reminder-topic',
      }))()

    async function insertShift(input: {
      state: string
      userId: string | null
      startOffsetHours: number
    }): Promise<string> {
      const startsAt = new Date(now.getTime() + input.startOffsetHours * HOUR)
      const endsAt = new Date(startsAt.getTime() + 2 * HOUR)

      const [shift] = await db
        .insert(oncallShifts)
        .values({
          poolId,
          userId: input.userId,
          state: input.state,
          startsAt,
          endsAt,
        })
        .returning({ id: oncallShifts.id })

      if (shift === undefined) {
        throw new Error('shift insert failed')
      }

      return shift.id
    }

    async function reminderRows(shiftId: string) {
      return await db
        .select({
          shiftId: outbox.shiftId,
          ticketId: outbox.ticketId,
          eventType: outbox.eventType,
          channel: outbox.channel,
          state: outbox.state,
          target: outbox.target,
        })
        .from(outbox)
        .where(
          and(
            eq(outbox.shiftId, shiftId),
            eq(outbox.eventType, 'oncall.unconfirmed_reminder'),
          ),
        )
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Reminder pool ${randomUUID().slice(0, 6)}` })
        .returning({ id: oncallPools.id })
      poolId = pool?.id ?? ''

      const [firstTech] = await db
        .insert(users)
        .values({ email: `reminder-tech-1-${randomUUID().slice(0, 8)}@example.org`, passwordHash: 'no-login' })
        .returning({ id: users.id })
      firstTechId = firstTech?.id ?? ''

      const [secondTech] = await db
        .insert(users)
        .values({ email: `reminder-tech-2-${randomUUID().slice(0, 8)}@example.org`, passwordHash: 'no-login' })
        .returning({ id: users.id })
      secondTechId = secondTech?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('queues one reminder for an unconfirmed shift that starts within the window', async () => {
      const shiftId = await insertShift({ state: 'DRAFT', userId: firstTechId, startOffsetHours: 2 })

      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 1 })

      const row = onlyRow(await reminderRows(shiftId), 'reminder row')
      expect(row.shiftId).toBe(shiftId)
      expect(row.ticketId).toBeNull()
      expect(row.eventType).toBe('oncall.unconfirmed_reminder')
      expect(row.channel).toBe('ntfy')
      expect(row.state).toBe('PENDING')
      expect(row.target).toEqual(
        expect.objectContaining({
          shiftId,
          state: 'DRAFT',
          poolName: expect.stringMatching(/^Reminder pool/),
        }),
      )
    })

    it('writes nothing on a second scan while the reminder row is still pending', async () => {
      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 0 })
    })

    it('ignores a shift outside the reminder window', async () => {
      const shiftId = await insertShift({ state: 'PLANNED', userId: firstTechId, startOffsetHours: 25 })

      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 0 })
      expect(await reminderRows(shiftId)).toEqual([])
    })

    it('ignores a shift that is already confirmed', async () => {
      const shiftId = await insertShift({ state: 'CONFIRMED', userId: firstTechId, startOffsetHours: 1 })

      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 0 })
      expect(await reminderRows(shiftId)).toEqual([])
    })

    it('ignores a slot without a technician', async () => {
      const shiftId = await insertShift({ state: 'PLANNED', userId: null, startOffsetHours: 3 })

      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 0 })
      expect(await reminderRows(shiftId)).toEqual([])
    })

    it('reminds again after the interval of the setting (WP-M23-09b)', async () => {
      const shiftId = await insertShift({ state: 'DRAFT', userId: firstTechId, startOffsetHours: 20 })

      const first = await enqueueOncallReminders(db, env, now)

      expect(first.remindersQueued).toBeGreaterThanOrEqual(1)
      expect(await reminderRows(shiftId)).toHaveLength(1)

      // the row of the first reminder went out — the sweep may ask again.
      // The row carries the moment of the sweep, so the test sets it to the
      // clock of the test.
      await db
        .update(outbox)
        .set({ state: 'SENT', createdAt: now })
        .where(eq(outbox.shiftId, shiftId))

      // too early: the interval of four hours has not passed
      await enqueueOncallReminders(db, env, new Date(now.getTime() + HOUR))

      expect(await reminderRows(shiftId)).toHaveLength(1)

      await enqueueOncallReminders(db, env, new Date(now.getTime() + 5 * HOUR))

      const rows = await reminderRows(shiftId)

      expect(rows).toHaveLength(2)
      // the number of the reminder travels in the target of the row
      expect(
        rows.map((row) => (row.target as { reminderNumber?: number }).reminderNumber),
      ).toEqual(expect.arrayContaining([1, 2]))
    })

    it('reports the counter for every unconfirmed readiness of the scan', async () => {
      const firstId = await insertShift({ state: 'DRAFT', userId: firstTechId, startOffsetHours: 5 })
      const secondId = await insertShift({ state: 'PLANNED', userId: secondTechId, startOffsetHours: 6 })

      const result = await enqueueOncallReminders(db, env, now)

      expect(result).toEqual({ remindersQueued: 2 })

      const firstRows = await reminderRows(firstId)
      const secondRows = await reminderRows(secondId)

      expect(firstRows).toHaveLength(1)
      expect(secondRows).toHaveLength(1)
      expect(onlyRow(firstRows, 'first reminder row').state).toBe('PENDING')
      expect(onlyRow(secondRows, 'second reminder row').state).toBe('PENDING')
    })
  },
)
