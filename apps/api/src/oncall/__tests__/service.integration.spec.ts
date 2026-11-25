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

const {
  oncallPools,
  oncallShifts,
  oncallEvents,
  oncallSwapRequests,
  roles,
  userRoles,
  users,
} = schema

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

    it('hands a confirmed shift over to another technician (WP-M23-10)', async () => {
      const shift = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({ state: 'CONFIRMED', confirmedAt: new Date() })
        .where(eq(oncallShifts.id, shift.id))

      const other = await userIdFor('tech-handover@example.org')

      const handed = await updateShift(
        db,
        shift.id,
        { userId: other, publish: true },
        adminId,
      )

      expect(handed.state).toBe('PLANNED')
      expect(handed.userId).toBe(other)

      const events = await db
        .select()
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shift.id))

      const types = events.map((event) => (event.payload as { type?: string })?.type)

      expect(types).toContain('shift_updated')
    })

    it('refuses the handover of a confirmed shift to a technician (WP-M23-10)', async () => {
      const shift = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({ state: 'CONFIRMED', confirmedAt: new Date() })
        .where(eq(oncallShifts.id, shift.id))

      const other = await userIdFor('tech-no-handover@example.org')

      await expect(
        updateShift(db, shift.id, { userId: other, publish: true }, techId),
      ).rejects.toMatchObject({ code: 'forbidden', statusCode: 403 })
    })

    it('cancels the open swap when the admin hands the shift over (WP-M23-10)', async () => {
      const shift = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({ state: 'SWAP_REQUESTED' })
        .where(eq(oncallShifts.id, shift.id))

      await db.insert(oncallSwapRequests).values({ shiftId: shift.id, status: 'PENDING' })

      const other = await userIdFor('tech-handover-swap@example.org')

      const handed = await updateShift(
        db,
        shift.id,
        { userId: other, publish: true },
        adminId,
      )

      expect(handed.state).toBe('PLANNED')
      expect(handed.userId).toBe(other)

      const swaps = await db
        .select({ status: oncallSwapRequests.status })
        .from(oncallSwapRequests)
        .where(eq(oncallSwapRequests.shiftId, shift.id))

      expect(swaps.map((swap) => swap.status)).toEqual(['CANCELLED'])

      const events = await db
        .select()
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shift.id))

      const types = events.map((event) => (event.payload as { type?: string })?.type)

      expect(types).toContain('swap_cancelled')
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

    it('generates one shift per block for a plan of day windows', async () => {
      const [office] = await db
        .insert(oncallPools)
        .values({
          name: 'Verwaltung Normalisierung',
          groupId: null,
          weeklyWindows: [
            { weekday: 1, start: '07:30', end: '17:00' },
            { weekday: 2, start: '07:30', end: '17:00' },
            { weekday: 3, start: '07:30', end: '17:00' },
            { weekday: 4, start: '07:30', end: '17:00' },
            { weekday: 5, start: '07:00', end: '12:00' },
          ],
        })
        .returning({ id: oncallPools.id })

      const from = new Date('2026-11-02T00:00:00.000Z')
      const to = new Date('2026-11-09T06:00:00.000Z')

      const result = await generateShifts(db, { poolId: office!.id, from, to })

      expect(result.created).toBe(2)

      const shifts = await db
        .select({ weekdays: oncallShifts.weekdays, dailyStart: oncallShifts.dailyStart })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, office!.id))

      expect(shifts.map((shift) => shift.weekdays)).toEqual(['1,2,3,4', '5'])
      expect(shifts.map((shift) => shift.dailyStart)).toEqual(['07:30', '07:00'])
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

    it('deletes a confirmed shift that has not started (ADR-0058)', async () => {
      const confirmed = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({
          state: 'CONFIRMED',
          confirmedAt: new Date(),
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(oncallShifts.id, confirmed.id))

      await deleteShift(db, confirmed.id, adminId)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, confirmed.id))

      expect(remaining).toHaveLength(0)
    })

    it('refuses to delete a confirmed shift that started (ADR-0058)', async () => {
      const confirmed = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({
          state: 'CONFIRMED',
          confirmedAt: new Date(),
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
        })
        .where(eq(oncallShifts.id, confirmed.id))

      await expect(deleteShift(db, confirmed.id, adminId)).rejects.toMatchObject({
        code: 'oncall_shift_locked',
        statusCode: 409,
        params: { reason: 'state' },
      })
    })

    it('refuses to delete a started shift that was published (ADR-0047)', async () => {
      const started = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, started.id))

      await expect(deleteShift(db, started.id, adminId)).rejects.toMatchObject({
        code: 'oncall_shift_locked',
        statusCode: 409,
        params: { reason: 'started' },
      })
    })

    it('deletes a started shift that nobody ever confirmed (ADR-0047)', async () => {
      const declined = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({
          state: 'DECLINED',
          declinedAt: new Date(),
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
        })
        .where(eq(oncallShifts.id, declined.id))

      await deleteShift(db, declined.id, adminId)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, declined.id))

      expect(remaining).toHaveLength(0)
    })

    it('refuses to delete a shift that held the duty (ADR-0047)', async () => {
      const confirmed = await createShift(db, { poolId, userId: techId, publish: true })

      await db
        .update(oncallShifts)
        .set({
          state: 'DECLINED',
          confirmedAt: new Date(),
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
        })
        .where(eq(oncallShifts.id, confirmed.id))

      await expect(deleteShift(db, confirmed.id, adminId)).rejects.toMatchObject({
        code: 'oncall_shift_locked',
        statusCode: 409,
        params: { reason: 'confirmed' },
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
