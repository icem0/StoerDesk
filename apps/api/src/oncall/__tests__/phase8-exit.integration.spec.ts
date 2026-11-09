import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { generateOncallSlots } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import {
  oncallEvents,
  oncallPools,
  oncallShifts,
  oncallSwapRequests,
  roles,
  settings,
  userRoles,
  users,
} from '../../db/schema'
import { acceptSwap, approveSwap, requestSwap } from '../swaps'

const HOUR = 60 * 60 * 1000

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase 8 exit criterion integration: ${testDatabase.reason}\n`)
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

type AcceptOutcome = Awaited<ReturnType<typeof acceptSwap>>

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase 8 exit criterion (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let adminId = ''
    let techAId = ''
    let techBId = ''
    let techCId = ''
    let poolId = ''
    let shiftId = ''
    let shiftSequence = 0

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

    async function setApprovalRequired(value: boolean): Promise<void> {
      await db
        .insert(settings)
        .values({ key: 'oncall.swap_requires_admin_approval', value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value },
        })
    }

    async function newConfirmedShift(): Promise<string> {
      shiftSequence += 1
      const startsAt = new Date(Date.now() + (2 + shiftSequence * 8) * 24 * HOUR)

      const [shift] = await db
        .insert(oncallShifts)
        .values({
          poolId,
          userId: techAId,
          state: 'CONFIRMED',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 7 * 24 * HOUR),
          confirmedAt: new Date(),
        })
        .returning({ id: oncallShifts.id })

      return shift!.id
    }

    async function shiftOf(id: string) {
      return onlyRow(
        await db
          .select({
            state: oncallShifts.state,
            userId: oncallShifts.userId,
          })
          .from(oncallShifts)
          .where(eq(oncallShifts.id, id))
          .limit(1),
        'shift',
      )
    }

    async function swapOf(id: string) {
      return onlyRow(
        await db
          .select({
            status: oncallSwapRequests.status,
            acceptedByUserId: oncallSwapRequests.acceptedByUserId,
          })
          .from(oncallSwapRequests)
          .where(eq(oncallSwapRequests.id, id))
          .limit(1),
        'swap',
      )
    }

    async function eventTypes(id: string): Promise<string[]> {
      const rows = await db
        .select({ payload: oncallEvents.payload })
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, id))

      return rows.map((row) => (row.payload as { type?: string }).type ?? '')
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-phase8@example.org')
      techAId = await userIdFor('tech-a-phase8@example.org')
      techBId = await userIdFor('tech-b-phase8@example.org')
      techCId = await userIdFor('tech-c-phase8@example.org')

      await grantRole(adminId, 'admin')
      await grantRole(techAId, 'oncall')
      await grantRole(techBId, 'oncall')
      await grantRole(techCId, 'oncall')

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Phase 8 Exit', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    beforeEach(async () => {
      await setApprovalRequired(true)
      shiftId = await newConfirmedShift()
    })

    it('keeps the neutral November week at 168 hours', () => {
      const slots = generateOncallSlots({
        from: new Date('2026-11-02T00:00:00.000Z'),
        to: new Date('2026-11-09T06:00:00.000Z'),
        weekStartWeekday: 1,
        startTime: '07:00',
        durationDays: 7,
      })

      expect(slots).toHaveLength(1)
      expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T06:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-09T06:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(168 * HOUR)
    })

    it('keeps the spring DST week of 2026-03-23 at 167 hours', () => {
      const slots = generateOncallSlots({
        from: new Date('2026-03-23T00:00:00.000Z'),
        to: new Date('2026-03-30T05:00:00.000Z'),
        weekStartWeekday: 1,
        startTime: '07:00',
        durationDays: 7,
      })

      expect(slots).toHaveLength(1)
      expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-03-23T06:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-03-30T05:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(167 * HOUR)
    })

    it('keeps the autumn DST week of 2026-10-19 at 169 hours', () => {
      const slots = generateOncallSlots({
        from: new Date('2026-10-19T00:00:00.000Z'),
        to: new Date('2026-10-26T06:00:00.000Z'),
        weekStartWeekday: 1,
        startTime: '07:00',
        durationDays: 7,
      })

      expect(slots).toHaveLength(1)
      expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-10-19T05:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-10-26T06:00:00.000Z').getTime())
      expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(169 * HOUR)
    })

    it('accepts exactly one of two concurrent acceptances with approval on', async () => {
      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      const outcomes = await Promise.allSettled([
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId }),
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techCId }),
      ])

      const winners = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<AcceptOutcome> =>
          outcome.status === 'fulfilled',
      )
      const losers = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      )

      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)

      const winner = winners[0]!.value
      expect(winner.swap.status).toBe('ACCEPTED')
      expect(winner.shiftChanged).toBe(false)

      expect(losers[0]!.reason).toMatchObject({ statusCode: 409 })
      expect(['swap_taken', 'swap_not_pending']).toContain(
        (losers[0]!.reason as { code?: string }).code,
      )

      const storedSwap = await swapOf(first.swap.id)
      expect(storedSwap.status).toBe('ACCEPTED')
      expect(storedSwap.acceptedByUserId).toBe(winner.swap.acceptedByUserId)

      const pendingShift = await shiftOf(shiftId)
      expect(pendingShift.state).toBe('SWAP_REQUESTED')
      expect(pendingShift.userId).toBe(techAId)

      const pendingTypes = await eventTypes(shiftId)
      expect(pendingTypes.filter((type) => type === 'swap_accepted')).toHaveLength(1)

      const approved = await approveSwap(db, {
        swapId: first.swap.id,
        actorUserId: adminId,
      })
      expect(approved.swap.status).toBe('APPROVED')

      const approvedShift = await shiftOf(shiftId)
      expect(approvedShift.state).toBe('CONFIRMED')
      expect(approvedShift.userId).toBe(winner.swap.acceptedByUserId)
    })

    it('accepts exactly one of two concurrent acceptances with approval off', async () => {
      await setApprovalRequired(false)

      const first = await requestSwap(db, { shiftId, actorUserId: techAId })

      const outcomes = await Promise.allSettled([
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techBId }),
        acceptSwap(db, { swapId: first.swap.id, actorUserId: techCId }),
      ])

      const winners = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<AcceptOutcome> =>
          outcome.status === 'fulfilled',
      )
      const losers = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      )

      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)

      const winner = winners[0]!.value
      expect(winner.swap.status).toBe('ACCEPTED')
      expect(winner.shiftChanged).toBe(true)

      const storedSwap = await swapOf(first.swap.id)
      expect(storedSwap.acceptedByUserId).toBe(winner.swap.acceptedByUserId)

      const approvedShift = await shiftOf(shiftId)
      expect(approvedShift.state).toBe('CONFIRMED')
      expect(approvedShift.userId).toBe(winner.swap.acceptedByUserId)

      const types = await eventTypes(shiftId)
      expect(types.filter((type) => type === 'swap_approved')).toHaveLength(1)
      expect(types.filter((type) => type === 'swap_accepted')).toHaveLength(0)
    })
  },
)
