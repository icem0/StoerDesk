import { and, eq } from 'drizzle-orm'
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
 * The exit criterion of phase 15 (`specs/04-oncall.md` §4a.3.2, ADR-0035): a
 * pool with office hours is expressible, every duty window is a shift of its
 * own, and the coupling names the technician only inside a window.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call window plan integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

/** The windows of the office: Monday to Thursday 07:30–17:00, Friday 07:00–12:00. */
const OFFICE_WINDOWS = [
  { weekday: 1, start: '07:30', end: '17:00' },
  { weekday: 2, start: '07:30', end: '17:00' },
  { weekday: 3, start: '07:30', end: '17:00' },
  { weekday: 4, start: '07:30', end: '17:00' },
  { weekday: 5, start: '07:00', end: '12:00' },
]

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the duty windows of the readiness (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let technicianId = ''
    let poolId = ''
    let cookie = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-window-user' })
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

    function putSettings(payload: Record<string, unknown>) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/oncall',
        headers: { cookie },
        payload,
      })
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

      adminId = await userIdFor('admin-windows@example.org')
      technicianId = await userIdFor('technician-windows@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: technicianId, roleId: await roleIdFor('oncall') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Verwaltung', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

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

    it('expresses the office hours of the pool as five shifts of a week', async () => {
      await putSettings({
        'oncall.weekly_windows': OFFICE_WINDOWS,
        'oncall.default_pool_id': poolId,
      })

      const generated = await postGenerate({
        poolId,
        from: '2026-11-02T00:00:00.000Z',
        to: '2026-11-09T00:00:00.000Z',
      })

      expect(generated.statusCode).toBe(200)
      expect(generated.json<{ created: number }>().created).toBe(5)

      const shifts = await db
        .select({ startsAt: oncallShifts.startsAt, endsAt: oncallShifts.endsAt })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, poolId))

      expect(
        shifts
          .map((shift) => ({
            startsAt: shift.startsAt.toISOString(),
            endsAt: shift.endsAt.toISOString(),
          }))
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
      ).toEqual([
        { startsAt: '2026-11-02T06:30:00.000Z', endsAt: '2026-11-02T16:00:00.000Z' },
        { startsAt: '2026-11-03T06:30:00.000Z', endsAt: '2026-11-03T16:00:00.000Z' },
        { startsAt: '2026-11-04T06:30:00.000Z', endsAt: '2026-11-04T16:00:00.000Z' },
        { startsAt: '2026-11-05T06:30:00.000Z', endsAt: '2026-11-05T16:00:00.000Z' },
        { startsAt: '2026-11-06T06:00:00.000Z', endsAt: '2026-11-06T11:00:00.000Z' },
      ])
    })

    it('names the technician of a shift only inside its window', async () => {
      await putSettings({
        'oncall.weekly_windows': OFFICE_WINDOWS,
        'oncall.default_pool_id': poolId,
      })
      await postGenerate({
        poolId,
        from: '2026-11-02T00:00:00.000Z',
        to: '2026-11-09T00:00:00.000Z',
      })

      const monday = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(
          and(
            eq(oncallShifts.poolId, poolId),
            eq(oncallShifts.startsAt, new Date('2026-11-02T06:30:00.000Z')),
          ),
        )

      const assigned = await patchShift(onlyRow(monday, 'the Monday shift').id, {
        userId: technicianId,
        publish: true,
      })

      expect(assigned.statusCode).toBe(200)

      const inside = await resolveOnCallPerson(db, {
        at: new Date('2026-11-02T08:00:00.000Z'),
        poolId,
      })
      const outside = await resolveOnCallPerson(db, {
        at: new Date('2026-11-02T18:00:00.000Z'),
        poolId,
      })
      const friday = await resolveOnCallPerson(db, {
        at: new Date('2026-11-06T09:30:00.000Z'),
        poolId,
      })

      expect(inside.kind).toBe('planned')
      expect(inside.userId).toBe(technicianId)
      expect(outside.kind).toBe('unstaffed')
      expect(outside.userId).toBeUndefined()
      expect(friday.kind).toBe('unstaffed')
      expect(friday.userId).toBeUndefined()
    })
  },
)
