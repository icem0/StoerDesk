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
import { resolveOnCallPerson } from '../coupling'

/**
 * The exit criterion of phase 20 (`specs/04-oncall.md` §4a.3.3, ADR-0040):
 * the office week holds two shifts, the technician week holds one, and the
 * coupling names the technician only inside the pattern of the block.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped duty blocks exit criterion: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

/** The blocks of the office: Monday to Thursday 07:00–17:00, Friday 07:00–12:00. */
const OFFICE_BLOCKS = [
  { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
  { from_weekday: 5, to_weekday: 5, start: '07:00', end: '12:00' },
]

/** The block of the technician: Monday to Sunday, around the clock. */
const TECHNICIAN_BLOCKS = [{ from_weekday: 1, to_weekday: 0, start: '00:00', end: '24:00' }]

/** The week of the office in the local wall clock: Monday 00:00 to Monday 00:00. */
const WEEK_FROM = '2026-11-01T23:00:00.000Z'
const WEEK_TO = '2026-11-08T23:00:00.000Z'

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the duty blocks satisfy their criterion (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let technicianId = ''
    let officePoolId = ''
    let cookie = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-duty-block-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
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

    function patchShift(id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/oncall/shifts/${id}`,
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-duty-blocks@example.org')
      technicianId = await userIdFor('technician-duty-blocks@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: technicianId, roleId: await roleIdFor('oncall') },
      ])

      officePoolId = await poolWithPlan('Verwaltung', OFFICE_BLOCKS)
      const technicianPoolId = await poolWithPlan('Technik', TECHNICIAN_BLOCKS)

      const session = await createSession(db, adminId, 1)
      cookie = `session=${session.token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const office = await postGenerate({
        poolId: officePoolId,
        from: WEEK_FROM,
        to: WEEK_TO,
      })
      expect(office.statusCode).toBe(200)
      expect(office.json<{ created: number }>().created).toBe(2)

      const technician = await postGenerate({
        poolId: technicianPoolId,
        from: WEEK_FROM,
        to: WEEK_TO,
      })
      expect(technician.statusCode).toBe(200)
      expect(technician.json<{ created: number }>().created).toBe(1)
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('holds two shifts in the week of the office and one in the week of the technician', async () => {
      const officeShifts = await db
        .select({ startsAt: oncallShifts.startsAt, endsAt: oncallShifts.endsAt })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, officePoolId))

      expect(
        officeShifts
          .map((shift) => ({
            startsAt: shift.startsAt.toISOString(),
            endsAt: shift.endsAt.toISOString(),
          }))
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
      ).toEqual([
        { startsAt: '2026-11-02T06:00:00.000Z', endsAt: '2026-11-05T16:00:00.000Z' },
        { startsAt: '2026-11-06T06:00:00.000Z', endsAt: '2026-11-06T11:00:00.000Z' },
      ])
    })

    it('names the technician only inside the pattern of the block', async () => {
      const monday = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.startsAt, new Date('2026-11-02T06:00:00.000Z')))

      const assigned = await patchShift(onlyRow(monday, 'the Monday shift').id, {
        userId: technicianId,
        publish: true,
      })

      expect(assigned.statusCode).toBe(200)

      const inside = await resolveOnCallPerson(db, {
        at: new Date('2026-11-02T07:00:00.000Z'),
        poolId: officePoolId,
      })
      const friday = await resolveOnCallPerson(db, {
        at: new Date('2026-11-06T14:00:00.000Z'),
        poolId: officePoolId,
      })
      const saturday = await resolveOnCallPerson(db, {
        at: new Date('2026-11-07T08:00:00.000Z'),
        poolId: officePoolId,
      })

      expect(inside.kind).toBe('planned')
      expect(inside.userId).toBe(technicianId)
      expect(friday.kind).toBe('unstaffed')
      expect(saturday.kind).toBe('unstaffed')
    })
  },
)
