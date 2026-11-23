import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { oncallPools, oncallShifts } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

/**
 * The duty blocks of the readiness (`specs/04-oncall.md` §4a.3.3, ADR-0040):
 * a block is one shift per week and the shift carries the pattern of the
 * block — the covered weekdays with the daily window.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped duty block integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

/** The blocks of the office: Monday to Thursday 07:00–17:00, Friday 07:00–12:00. */
const OFFICE_BLOCKS = [
  { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
  { from_weekday: 5, to_weekday: 5, start: '07:00', end: '12:00' },
]

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the duty blocks of the readiness (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let cookie = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-block-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    async function poolWithPlan(name: string, plan: unknown): Promise<string> {
      const inserted = await db
        .insert(oncallPools)
        .values({ name, groupId: null, weeklyWindows: plan as never })
        .returning({ id: oncallPools.id })

      return onlyRow(inserted, 'pool').id
    }

    function postGenerate(payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts/generate',
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-blocks@example.org')

      await db.insert(userRoles).values({
        userId: adminId,
        roleId: await roleIdFor('admin'),
      })

      cookie = await sessionCookieFor(adminId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('generates one shift per block of the week with its pattern', async () => {
      const poolId = await poolWithPlan('Verwaltung', OFFICE_BLOCKS)

      const generated = await postGenerate({
        poolId,
        from: '2026-11-01T23:00:00.000Z',
        to: '2026-11-08T23:00:00.000Z',
      })

      expect(generated.statusCode).toBe(200)
      expect(generated.json<{ created: number }>().created).toBe(2)

      const shifts = await db
        .select({
          startsAt: oncallShifts.startsAt,
          endsAt: oncallShifts.endsAt,
          weekdays: oncallShifts.weekdays,
          dailyStart: oncallShifts.dailyStart,
          dailyEnd: oncallShifts.dailyEnd,
        })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, poolId))

      expect(
        shifts
          .map((shift) => ({
            startsAt: shift.startsAt.toISOString(),
            endsAt: shift.endsAt.toISOString(),
            weekdays: shift.weekdays,
            dailyStart: shift.dailyStart,
            dailyEnd: shift.dailyEnd,
          }))
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
      ).toEqual([
        {
          startsAt: '2026-11-02T06:00:00.000Z',
          endsAt: '2026-11-05T16:00:00.000Z',
          weekdays: '1,2,3,4',
          dailyStart: '07:00',
          dailyEnd: '17:00',
        },
        {
          startsAt: '2026-11-06T06:00:00.000Z',
          endsAt: '2026-11-06T11:00:00.000Z',
          weekdays: '5',
          dailyStart: '07:00',
          dailyEnd: '12:00',
        },
      ])
    })

    it('reads a stored day window as a block of one day', async () => {
      const poolId = await poolWithPlan('Servicetechniker', [
        { weekday: 3, start: '08:00', end: '16:00' },
      ])

      const generated = await postGenerate({
        poolId,
        from: '2026-11-04T00:00:00.000Z',
        to: '2026-11-05T00:00:00.000Z',
      })

      expect(generated.json<{ created: number }>().created).toBe(1)

      const shifts = await db
        .select({
          startsAt: oncallShifts.startsAt,
          endsAt: oncallShifts.endsAt,
          weekdays: oncallShifts.weekdays,
        })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, poolId))

      expect(shifts).toHaveLength(1)
      expect(shifts[0]!.startsAt.toISOString()).toBe('2026-11-04T07:00:00.000Z')
      expect(shifts[0]!.endsAt.toISOString()).toBe('2026-11-04T15:00:00.000Z')
      expect(shifts[0]!.weekdays).toBe('3')
    })

    it('leaves the shift of the continuous plan without a pattern', async () => {
      const poolId = await poolWithPlan('Bereitschaft', [])

      const generated = await postGenerate({
        poolId,
        from: '2026-11-02T00:00:00.000Z',
        to: '2026-11-09T00:00:00.000Z',
      })

      expect(generated.json<{ created: number }>().created).toBe(1)

      const shifts = await db
        .select({ weekdays: oncallShifts.weekdays })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, poolId))

      expect(shifts).toHaveLength(1)
      expect(shifts[0]!.weekdays).toBeNull()
    })
  },
)
