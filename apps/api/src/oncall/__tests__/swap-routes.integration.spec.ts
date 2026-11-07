import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { oncallPools, oncallShifts, oncallSwapRequests, settings } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call swap routes integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type SwapRow = {
  id: string
  shiftId: string
  status: string
  requestedByUserId: string | null
  targetUserId: string | null
  acceptedByUserId: string | null
  acceptedAt: string | null
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('on-call swap routes (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let adminId = ''
  let techAId = ''
  let techBId = ''
  let techCId = ''
  let reporterId = ''
  let poolId = ''
  let shiftId = ''
  const cookies: Record<'admin' | 'techA' | 'techB' | 'techC' | 'reporter', string> = {
    admin: '',
    techA: '',
    techB: '',
    techC: '',
    reporter: '',
  }

  async function userIdFor(email: string): Promise<string> {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash: 'no-login-for-swap-route-user' })
      .returning({ id: users.id })

    return onlyRow(inserted, `user ${email}`).id
  }

  async function roleIdFor(key: string): Promise<string> {
    return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
      .id
  }

  async function grantRole(userId: string, roleKey: string): Promise<void> {
    await db.insert(userRoles).values({ userId, roleId: await roleIdFor(roleKey) })
  }

  async function sessionCookieFor(userId: string): Promise<string> {
    const session = await createSession(db, userId, 1)

    return `session=${session.token}`
  }

  function requestSwap(cookie: string, id: string, body?: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/oncall/shifts/${id}/swap`,
      headers: { cookie },
      payload: body,
    })
  }

  function acceptSwap(cookie: string, id: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/oncall/swaps/${id}/accept`,
      headers: { cookie },
    })
  }

  function approveSwap(cookie: string, id: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/oncall/swaps/${id}/approve`,
      headers: { cookie },
    })
  }

  function rejectSwap(cookie: string, id: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/oncall/swaps/${id}/reject`,
      headers: { cookie },
    })
  }

  function cancelSwap(cookie: string, id: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/oncall/swaps/${id}/cancel`,
      headers: { cookie },
    })
  }

  async function shiftRow() {
    return onlyRow(
      await db
        .select({ state: oncallShifts.state, userId: oncallShifts.userId })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, shiftId))
        .limit(1),
      'shift',
    )
  }

  async function setApproval(value: boolean) {
    await db
      .insert(settings)
      .values({ key: 'oncall.swap_requires_admin_approval', value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    adminId = await userIdFor('admin-swap-route@example.org')
    techAId = await userIdFor('tech-a-swap-route@example.org')
    techBId = await userIdFor('tech-b-swap-route@example.org')
    techCId = await userIdFor('tech-c-swap-route@example.org')
    reporterId = await userIdFor('reporter-swap-route@example.org')

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

    const [shift] = await db
      .insert(oncallShifts)
      .values({
        poolId,
        userId: techAId,
        state: 'CONFIRMED',
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
        confirmedAt: new Date(),
      })
      .returning({ id: oncallShifts.id })

    shiftId = shift!.id

    for (const [key, id] of Object.entries({
      admin: adminId,
      techA: techAId,
      techB: techBId,
      techC: techCId,
      reporter: reporterId,
    }) as Array<[keyof typeof cookies, string]>) {
      cookies[key] = await sessionCookieFor(id)
    }

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

  beforeEach(async () => {
    await db
      .update(oncallSwapRequests)
      .set({ status: 'CANCELLED' })
      .where(eq(oncallSwapRequests.shiftId, shiftId))

    await db
      .update(oncallShifts)
      .set({
        state: 'CONFIRMED',
        userId: techAId,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .where(eq(oncallShifts.id, shiftId))

    await setApproval(true)
  })

  it('answers 401 for an anonymous swap request and acceptance', async () => {
    const request = await app.inject({
      method: 'POST',
      url: `/api/v1/oncall/shifts/${shiftId}/swap`,
    })
    const accept = await app.inject({
      method: 'POST',
      url: '/api/v1/oncall/swaps/00000000-0000-0000-0000-000000000000/accept',
    })

    expect(request.statusCode).toBe(401)
    expect(request.json<ErrorResponseBody>().code).toBe('session_invalid')
    expect(accept.statusCode).toBe(401)
    expect(accept.json<ErrorResponseBody>().code).toBe('session_invalid')
  })

  it('refuses a swap request without oncall.swap with 403', async () => {
    const response = await requestSwap(cookies['reporter'], shiftId)

    expect(response.statusCode).toBe(403)
    expect(response.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
  })

  it('requests a swap as the assigned technician and moves the shift to SWAP_REQUESTED', async () => {
    const response = await requestSwap(cookies['techA'], shiftId, { targetUserId: techBId })

    expect(response.statusCode).toBe(201)
    const body = response.json<SwapRow>()
    expect(body.status).toBe('PENDING')
    expect(body.requestedByUserId).toBe(techAId)
    expect(body.targetUserId).toBe(techBId)

    expect((await shiftRow()).state).toBe('SWAP_REQUESTED')
  })

  it('refuses an invalid swap id with 400', async () => {
    const response = await acceptSwap(cookies['techB'], 'not-a-uuid')

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorResponseBody>().code).toBe('invalid_request')
  })

  it('accepts with approval required and approves as admin', async () => {
    const requested = await requestSwap(cookies['techA'], shiftId)

    const accepted = await acceptSwap(cookies['techB'], requested.json<SwapRow>().id)

    expect(accepted.statusCode).toBe(200)
    const acceptBody = accepted.json<{ swap: SwapRow; shiftChanged: boolean }>()
    expect(acceptBody.swap.status).toBe('ACCEPTED')
    expect(acceptBody.shiftChanged).toBe(false)

    expect((await shiftRow()).userId).toBe(techAId)

    const approved = await approveSwap(
      cookies['admin'],
      requested.json<SwapRow>().id,
    )

    expect(approved.statusCode).toBe(200)
    expect(approved.json<SwapRow>().status).toBe('APPROVED')

    const after = await shiftRow()
    expect(after.state).toBe('CONFIRMED')
    expect(after.userId).toBe(techBId)
  })

  it('refuses approve/reject without oncall.admin with 403', async () => {
    const requested = await requestSwap(cookies['techA'], shiftId)
    const swapId = requested.json<SwapRow>().id

    const approve = await approveSwap(cookies['techB'], swapId)
    const reject = await rejectSwap(cookies['techB'], swapId)

    expect(approve.statusCode).toBe(403)
    expect(approve.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    expect(reject.statusCode).toBe(403)
    expect(reject.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
  })

  it('accepts immediately when approval is off', async () => {
    await setApproval(false)

    const requested = await requestSwap(cookies['techA'], shiftId)
    const accepted = await acceptSwap(cookies['techB'], requested.json<SwapRow>().id)

    expect(accepted.statusCode).toBe(200)
    const body = accepted.json<{ swap: SwapRow; shiftChanged: boolean }>()
    expect(body.shiftChanged).toBe(true)

    const after = await shiftRow()
    expect(after.state).toBe('CONFIRMED')
    expect(after.userId).toBe(techBId)
  })

  it('lets exactly one of two concurrent acceptances win', async () => {
    const requested = await requestSwap(cookies['techA'], shiftId)
    const swapId = requested.json<SwapRow>().id

    const [first, second] = await Promise.all([
      acceptSwap(cookies['techB'], swapId),
      acceptSwap(cookies['techC'], swapId),
    ])

    const results = [first, second]
    const winners = results.filter((response) => response.statusCode === 200)
    const losers = results.filter((response) => response.statusCode === 409)

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(['swap_taken', 'swap_not_pending']).toContain(
      losers[0]!.json<ErrorResponseBody>().code,
    )
  })

  it('rejects an accepted swap as admin and returns the original technician', async () => {
    const requested = await requestSwap(cookies['techA'], shiftId)
    const swapId = requested.json<SwapRow>().id

    await acceptSwap(cookies['techB'], swapId)
    const rejected = await rejectSwap(cookies['admin'], swapId)

    expect(rejected.statusCode).toBe(200)
    expect(rejected.json<SwapRow>().status).toBe('DECLINED')

    const after = await shiftRow()
    expect(after.state).toBe('CONFIRMED')
    expect(after.userId).toBe(techAId)
  })

  it('lets the requester cancel and refuses a foreign cancellation with 403', async () => {
    const requested = await requestSwap(cookies['techA'], shiftId)
    const swapId = requested.json<SwapRow>().id

    const foreign = await cancelSwap(cookies['techB'], swapId)
    expect(foreign.statusCode).toBe(403)

    const cancelled = await cancelSwap(cookies['techA'], swapId)

    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json<SwapRow>().status).toBe('CANCELLED')

    const after = await shiftRow()
    expect(after.state).toBe('CONFIRMED')
    expect(after.userId).toBe(techAId)
  })
})
