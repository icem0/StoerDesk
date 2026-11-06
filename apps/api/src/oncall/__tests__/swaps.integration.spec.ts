import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { settings, oncallEvents, oncallPools, oncallShifts, oncallSwapRequests, roles, userRoles, users } from '../../db/schema'
import {
  acceptSwap,
  approveSwap,
  cancelSwap,
  rejectSwap,
  requestSwap,
} from '../swaps'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call swap service integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call swap service (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let adminId = ''
    let techAId = ''
    let techBId = ''
    let techCId = ''
    let reporterId = ''
    let poolId = ''
    let shiftId = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-service-user' })
        .returning({ id: users.id })

      return inserted[0]!.id
    }

    async function roleIdFor(key: string): Promise<string> {
      return (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)))[0]!.id
    }

    async function grantRole(userId: string, roleKey: string): Promise<void> {
      await db.insert(userRoles).values({
        userId,
        roleId: await roleIdFor(roleKey),
      })
    }

    function shiftOf(id: string) {
      return db
        .select({
          id: oncallShifts.id,
          state: oncallShifts.state,
          userId: oncallShifts.userId,
          startsAt: oncallShifts.startsAt,
        })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, id))
        .limit(1)
    }

    function swapOf(id: string) {
      return db
        .select({
          id: oncallSwapRequests.id,
          status: oncallSwapRequests.status,
          requestedByUserId: oncallSwapRequests.requestedByUserId,
          targetUserId: oncallSwapRequests.targetUserId,
          acceptedByUserId: oncallSwapRequests.acceptedByUserId,
          acceptedAt: oncallSwapRequests.acceptedAt,
        })
        .from(oncallSwapRequests)
        .where(eq(oncallSwapRequests.id, id))
        .limit(1)
    }

    function eventsFor(shiftId: string) {
      return db
        .select({ payload: oncallEvents.payload })
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shiftId))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-swap@example.org')
      techAId = await userIdFor('tech-a-swap@example.org')
      techBId = await userIdFor('tech-b-swap@example.org')
      techCId = await userIdFor('tech-c-swap@example.org')
      reporterId = await userIdFor('reporter-swap@example.org')

      await grantRole(adminId, 'admin')
      await grantRole(techAId, 'oncall')
      await grantRole(techBId, 'oncall')
      await grantRole(techCId, 'oncall')
      await grantRole(reporterId, 'reporter_internal')

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Feuerwehr', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      const now = new Date()
      const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000)

      const [shift] = await db
        .insert(oncallShifts)
        .values({
          poolId,
          userId: techAId,
          state: 'CONFIRMED',
          startsAt,
          endsAt,
          confirmedAt: new Date(),
        })
        .returning({ id: oncallShifts.id })

      shiftId = shift!.id

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    beforeEach(async () => {
      await db
        .update(oncallSwapRequests)
        .set({ status: 'CANCELLED' })
        .where(eq(oncallSwapRequests.shiftId, shiftId))

      const now = new Date()
      const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      await db
        .update(oncallShifts)
        .set({ state: 'CONFIRMED', userId: techAId, startsAt })
        .where(eq(oncallShifts.id, shiftId))
    })

    it('requests a swap as the assigned technician', async () => {
      const result = await requestSwap(db, { shiftId, actorUserId: techAId })

      expect(result.swap.status).toBe('PENDING')
      expect(result.swap.requestedByUserId).toBe(techAId)
      expect(result.swap.targetUserId).toBeNull()

      const stored = await shiftOf(shiftId)
      expect(onlyRow(stored, 'shift').state).toBe('SWAP_REQUESTED')

      const events = await eventsFor(shiftId)
      expect(
        events.some((e) => (e.payload as { type?: string }).type === 'swap_requested'),
      ).toBe(true)
    })

    it('refuses a swap request by a non-assigned technician with 403', async () => {
      await expect(
        requestSwap(db, { shiftId: shiftId, actorUserId: techBId }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    })

    it('refuses a swap request on a non-confirmed shift with 409', async () => {
      await db
        .update(oncallShifts)
        .set({ state: 'PLANNED' })
        .where(eq(oncallShifts.id, shiftId))

      await expect(
        requestSwap(db, { shiftId, actorUserId: techAId }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'oncall_invalid_shift_state',
      })

      await db
        .update(oncallShifts)
        .set({ state: 'CONFIRMED' })
        .where(eq(oncallShifts.id, shiftId))
    })

    it('refuses a swap request after the shift started with 409', async () => {
      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, shiftId))

      await expect(
        requestSwap(db, { shiftId, actorUserId: techAId }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'oncall_shift_started' })

      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, shiftId))
    })

    it('refuses targeting oneself with 403', async () => {
      await expect(
        requestSwap(db, { shiftId, actorUserId: techAId, targetUserId: techAId }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    })

    it('refuses a foreign candidate with 403', async () => {
      await expect(
        requestSwap(db, {
          shiftId,
          actorUserId: techAId,
          targetUserId: reporterId,
        }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    })

    it('rejects a second sequential request on a swap-requested shift with 409', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      expect(first.swap.status).toBe('PENDING')

      await expect(
        requestSwap(db, { shiftId, actorUserId: techAId }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'oncall_invalid_shift_state',
      })
    })

    it('rejects a duplicate pending request with 409 swap_already_open', async () => {
      await db
        .insert(oncallSwapRequests)
        .values({
          shiftId,
          requestedByUserId: techBId,
          status: 'PENDING',
        })

      await expect(
        requestSwap(db, { shiftId, actorUserId: techAId }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'swap_already_open' })

      await db
        .update(oncallSwapRequests)
        .set({ status: 'CANCELLED' })
        .where(eq(oncallSwapRequests.shiftId, shiftId))
    })

    it('accepts a pending swap atomically — exactly one of two concurrent acceptances wins', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      let winner: { swap: { status: string; acceptedByUserId: string | null } } | null = null
      let loser: unknown = null

      await Promise.all([
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId }).then(
          (value) => {
            winner = value
          },
        ),
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techCId }).then(
          (value) => {
            winner = value
          },
        ),
      ]).catch((error) => {
        loser = error
      })

      expect(winner).not.toBeNull()
      expect(winner!.swap.status).toBe('ACCEPTED')

      // The loser either lost the atomic UPDATE (`swap_taken`) or read the swap
      // after it was already accepted (`swap_not_pending`); both mean "did not
      // win the race". Exactly one acceptance succeeds.
      expect(loser).toMatchObject({ statusCode: 409 })
      const loserCode = (loser as { code?: string }).code
      expect(['swap_taken', 'swap_not_pending']).toContain(loserCode)

      const stored = await swapOf(first.swap.id)
      expect(onlyRow(stored, 'swap').status).toBe('ACCEPTED')
      expect(onlyRow(stored, 'swap').acceptedByUserId).toBe(
        winner!.swap.acceptedByUserId,
      )

      await cleanupSwap(first.swap.id)
    })

    it('refuses acceptance by the requester with 403', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await expect(
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techAId }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })

      await cleanupSwap(first.swap.id)
    })

    it('refuses acceptance by a non-pool member with 403', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await expect(
        acceptSwap(db, { swapId: first.swap.id, actorUserId: reporterId }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })

      await cleanupSwap(first.swap.id)
    })

    it('refuses rejecting a closed swap with 409 swap_not_pending', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await cancelSwap(db, { swapId: first.swap.id, actorUserId: techAId })

      await expect(
        rejectSwap(db, { swapId: first.swap.id, actorUserId: adminId }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'swap_not_pending' })
    })

    it('refuses acceptance after the shift started with 409 oncall_shift_started', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, shiftId))

      await expect(
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'oncall_shift_started' })

      await db
        .update(oncallShifts)
        .set({ startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
        .where(eq(oncallShifts.id, shiftId))

      await cleanupSwap(first.swap.id)
    })

    it('with approval required, acceptance keeps the original technician until approved', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })
      await acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId })

      const stored = await swapOf(first.swap.id)
      expect(onlyRow(stored, 'swap').status).toBe('ACCEPTED')

      const shift = await shiftOf(shiftId)
      expect(onlyRow(shift, 'shift').state).toBe('SWAP_REQUESTED')
      expect(onlyRow(shift, 'shift').userId).toBe(techAId)

      const approved = await approveSwap(db, {
        swapId: first.swap.id,
        actorUserId: adminId,
      })
      expect(approved.swap.status).toBe('APPROVED')

      const after = await shiftOf(shiftId)
      expect(onlyRow(after, 'shift').state).toBe('CONFIRMED')
      expect(onlyRow(after, 'shift').userId).toBe(techBId)

      const events = await eventsFor(shiftId)
      expect(
        events.some((e) => (e.payload as { type?: string }).type === 'swap_approved'),
      ).toBe(true)

      await cleanupSwap(first.swap.id)
    })

    it('with approval off, acceptance is effective immediately', async () => {
      await db
        .insert(settings)
        .values({ key: 'oncall.swap_requires_admin_approval', value: false })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: false },
        })

      try {
        const first = await requestSwap(db, { shiftId, actorUserId: techAId })
        const accepted = await acceptSwap(db, {
          swapId: first.swap.id,
          actorUserId: techBId,
        })

        expect(accepted.swap.status).toBe('ACCEPTED')
        expect(accepted.shiftChanged).toBe(true)

        const after = await shiftOf(shiftId)
        expect(onlyRow(after, 'shift').state).toBe('CONFIRMED')
        expect(onlyRow(after, 'shift').userId).toBe(techBId)

        await cleanupSwap(first.swap.id)
      } finally {
        await db
          .insert(settings)
          .values({ key: 'oncall.swap_requires_admin_approval', value: true })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: true },
          })
      }
    })

    it('admin rejection returns the shift to CONFIRMED with the original technician', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })
      await acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId })

      await rejectSwap(db, { swapId: first.swap.id, actorUserId: adminId })

      const stored = await swapOf(first.swap.id)
      expect(onlyRow(stored, 'swap').status).toBe('DECLINED')

      const after = await shiftOf(shiftId)
      expect(onlyRow(after, 'shift').state).toBe('CONFIRMED')
      expect(onlyRow(after, 'shift').userId).toBe(techAId)

      const events = await eventsFor(shiftId)
      expect(
        events.some((e) => (e.payload as { type?: string }).type === 'swap_rejected'),
      ).toBe(true)
    })

    it('requester cancellation returns the shift to CONFIRMED', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await cancelSwap(db, { swapId: first.swap.id, actorUserId: techAId })

      const stored = await swapOf(first.swap.id)
      expect(onlyRow(stored, 'swap').status).toBe('CANCELLED')

      const after = await shiftOf(shiftId)
      expect(onlyRow(after, 'shift').state).toBe('CONFIRMED')
      expect(onlyRow(after, 'shift').userId).toBe(techAId)

      const events = await eventsFor(shiftId)
      expect(
        events.some((e) => (e.payload as { type?: string }).type === 'swap_cancelled'),
      ).toBe(true)
    })

    it('refuses cancellation by a non-requester non-admin with 403', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      await expect(
        cancelSwap(db, { swapId: first.swap.id, actorUserId: techBId }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })

      await cleanupSwap(first.swap.id)
    })

    it('rejects an unknown swap with 404', async () => {
      await expect(
        acceptSwap(db, {
          swapId: '00000000-0000-0000-0000-000000000000',
          actorUserId: techBId,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'oncall_swap_request_not_found' })
    })

    async function cleanupSwap(swapId: string): Promise<void> {
      await db
        .update(oncallSwapRequests)
        .set({ status: 'CANCELLED' })
        .where(eq(oncallSwapRequests.id, swapId))

      await db
        .update(oncallShifts)
        .set({ state: 'CONFIRMED', userId: techAId })
        .where(eq(oncallShifts.id, shiftId))
    }

    function onlyRow<T>(rows: T[], what: string): T {
      const [row] = rows

      if (!row) {
        throw new Error(`expected one ${what}`)
      }

      return row
    }
  },
)
