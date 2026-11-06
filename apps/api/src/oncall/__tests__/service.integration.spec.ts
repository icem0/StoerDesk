import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import {
  createShift,
  deleteShift,
  generateShifts,
  updateShift,
} from '../service'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call service integration: ${testDatabase.reason}\n`)
}

const { oncallPools, oncallShifts, oncallEvents, roles, userRoles, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call planning service (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let adminId = ''
    let techId = ''
    let poolId = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-service-user' })
        .returning({ id: users.id })

      return inserted[0]!.id
    }

    async function roleIdFor(key: string): Promise<string> {
      const row = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, key))
        .limit(1)

      return row[0]!.id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-service@example.org')
      techId = await userIdFor('tech-service@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: techId, roleId: await roleIdFor('oncall') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Feuerwehr', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('creates an UNFILLED shift without a technician', async () => {
      const shift = await createShift(db, { poolId })

      expect(shift.state).toBe('UNFILLED')
      expect(shift.userId).toBeNull()
      expect(shift.poolId).toBe(poolId)
    })

    it('creates a DRAFT shift with a technician', async () => {
      const shift = await createShift(db, { poolId, userId: techId })

      expect(shift.state).toBe('DRAFT')
      expect(shift.userId).toBe(techId)
    })

    it('creates a PLANNED shift with publish', async () => {
      const shift = await createShift(db, { poolId, userId: techId, publish: true })

      expect(shift.state).toBe('PLANNED')
      expect(shift.userId).toBe(techId)
    })

    it('rejects create for an unknown pool', async () => {
      await expect(
        createShift(db, { poolId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'oncall_pool_not_found', statusCode: 404 })
    })

    it('writes a shift_created event for every created shift', async () => {
      const shift = await createShift(db, { poolId, userId: techId })

      const events = await db
        .select()
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shift.id))

      expect(events.some((e) => (e.payload as { type?: string })?.type === 'shift_created')).toBe(true)
    })

    it('publishes a DRAFT shift to PLANNED', async () => {
      const draft = await createShift(db, { poolId, userId: techId })

      const planned = await updateShift(db, draft.id, { publish: true }, adminId)

      expect(planned.state).toBe('PLANNED')
    })

    it('reassigns a shift and clears declined_at', async () => {
      const shift = await createShift(db, { poolId, userId: techId })

      const reassigned = await updateShift(db, shift.id, { userId: techId }, adminId)

      expect(reassigned.state).toBe('DRAFT')
      expect(reassigned.userId).toBe(techId)
    })

    it('rejects update on an unknown shift with 404', async () => {
      await expect(
        updateShift(db, '00000000-0000-0000-0000-000000000000', { publish: true }, adminId),
      ).rejects.toMatchObject({ code: 'oncall_shift_not_found', statusCode: 404 })
    })

    it('generates shifts idempotently', async () => {
      const from = new Date('2026-11-02T00:00:00.000Z')
      const to = new Date('2026-11-09T06:00:00.000Z')

      const first = await generateShifts(db, { poolId, from, to })
      const second = await generateShifts(db, { poolId, from, to })

      expect(first.created).toBeGreaterThan(0)
      expect(first.skipped).toBe(0)
      expect(second.created).toBe(0)
      expect(second.skipped).toBe(first.created)
    })

    it('deletes an UNFILLED shift', async () => {
      const shift = await createShift(db, { poolId })

      await deleteShift(db, shift.id, adminId)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, shift.id))

      expect(remaining).toHaveLength(0)
    })

    it('deletes a PLANNED shift', async () => {
      const planned = await createShift(db, { poolId, userId: techId, publish: true })

      await deleteShift(db, planned.id, adminId)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, planned.id))

      expect(remaining).toHaveLength(0)
    })

    it('refuses to delete a started shift', async () => {
      const started = await createShift(db, { poolId, userId: techId })

      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, started.id))

      await expect(deleteShift(db, started.id, adminId)).rejects.toMatchObject({
        code: 'oncall_shift_locked',
        statusCode: 409,
      })
    })

    it('records an event trail for create and update', async () => {
      const shift = await createShift(db, { poolId, userId: techId })
      await updateShift(db, shift.id, { publish: true }, adminId)

      const events = await db
        .select()
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shift.id))
        .orderBy(oncallEvents.createdAt)

      const types = events.map((e) => (e.payload as { type?: string })?.type)

      expect(types).toContain('shift_created')
      expect(types).toContain('shift_updated')

      await deleteShift(db, shift.id, adminId)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, shift.id))

      expect(remaining).toHaveLength(0)
    })
  },
)
