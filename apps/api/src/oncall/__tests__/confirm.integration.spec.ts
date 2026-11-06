import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { oncallEvents, oncallPools, oncallShifts } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call confirm/decline integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type ShiftRow = {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  declinedAt: string | null
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call confirm and decline (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let oncallId = ''
    let otherId = ''
    let poolId = ''
    const cookies: Record<'admin' | 'oncall' | 'other', string> = {
      admin: '',
      oncall: '',
      other: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-route-user' })
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

    async function createPlannedShift(actorCookie: string, userId: string | null) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie: actorCookie },
        payload: { poolId, userId, publish: true },
      })
    }

    function postConfirm(cookie: string, id: string, body?: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/oncall/shifts/${id}/confirm`,
        headers: { cookie },
        payload: body,
      })
    }

    function postDecline(cookie: string, id: string, body?: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/oncall/shifts/${id}/decline`,
        headers: { cookie },
        payload: body,
      })
    }

    function shiftOf(id: string) {
      return db
        .select({
          id: oncallShifts.id,
          state: oncallShifts.state,
          confirmedAt: oncallShifts.confirmedAt,
          declinedAt: oncallShifts.declinedAt,
        })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, id))
        .limit(1)
    }

    function eventsFor(shiftId: string) {
      return db
        .select({ payload: oncallEvents.payload, clientUuid: oncallEvents.clientUuid })
        .from(oncallEvents)
        .where(eq(oncallEvents.shiftId, shiftId))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-confirm@example.org')
      oncallId = await userIdFor('oncall-confirm@example.org')
      otherId = await userIdFor('other-confirm@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: oncallId, roleId: await roleIdFor('oncall') },
        { userId: otherId, roleId: await roleIdFor('reporter_internal') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Feuerwehr', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['oncall'] = await sessionCookieFor(oncallId)
      cookies['other'] = await sessionCookieFor(otherId)

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

    it('answers 401 before any permission check for an anonymous request', async () => {
      const confirm = await postConfirm(cookies['admin'], '00000000-0000-0000-0000-000000000000')
      const decline = await postDecline(cookies['admin'], '00000000-0000-0000-0000-000000000000')

      expect(confirm.statusCode).toBe(401)
      expect(confirm.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(decline.statusCode).toBe(401)
      expect(decline.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('refuses confirm/decline for roles without oncall.confirm', async () => {
      const response = await postDecline(cookies['other'], '00000000-0000-0000-0000-000000000000', {
        reason: 'not available',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('confirms a PLANNED shift as the assigned technician', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const response = await postConfirm(cookies['oncall'], shiftId)

      expect(response.statusCode).toBe(200)
      const body = response.json<ShiftRow>()
      expect(body.state).toBe('CONFIRMED')
      expect(body.confirmedAt).not.toBeNull()

      const stored = await shiftOf(shiftId)
      expect(onlyRow(stored, 'shift').state).toBe('CONFIRMED')
      expect(onlyRow(stored, 'shift').confirmedAt).not.toBeNull()

      const events = await eventsFor(shiftId)
      expect(events.some((event) => (event.payload as { type?: string }).type === 'confirmed')).toBe(true)
    })

    it('declines a PLANNED shift with a reason as the assigned technician', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const response = await postDecline(cookies['oncall'], shiftId, { reason: 'not available tonight' })

      expect(response.statusCode).toBe(200)
      const body = response.json<ShiftRow>()
      expect(body.state).toBe('DECLINED')
      expect(body.declinedAt).not.toBeNull()

      const stored = await shiftOf(shiftId)
      expect(onlyRow(stored, 'shift').state).toBe('DECLINED')
      expect(onlyRow(stored, 'shift').declinedAt).not.toBeNull()

      const events = await eventsFor(shiftId)
      expect(
        events.some(
          (event) =>
            (event.payload as { type?: string; reason?: string }).type === 'declined' &&
            (event.payload as { reason?: string }).reason === 'not available tonight',
        ),
      ).toBe(true)
    })

    it('declines a CONFIRMED shift before it starts', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      await postConfirm(cookies['oncall'], shiftId)

      const response = await postDecline(cookies['oncall'], shiftId, { reason: 'changed my mind' })

      expect(response.statusCode).toBe(200)
      expect(response.json<ShiftRow>().state).toBe('DECLINED')
    })

    it('rejects confirm/decline by a different technician with 403', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const confirm = await postConfirm(cookies['other'], shiftId)
      const decline = await postDecline(cookies['other'], shiftId, { reason: 'no' })

      expect(confirm.statusCode).toBe(403)
      expect(confirm.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(decline.statusCode).toBe(403)
      expect(decline.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('allows an admin to confirm another technician\'s shift', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const response = await postConfirm(cookies['admin'], shiftId)

      expect(response.statusCode).toBe(200)
      expect(response.json<ShiftRow>().state).toBe('CONFIRMED')
    })

    it('rejects confirming a non-PLANNED shift with 409', async () => {
      const unfilled = await app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie: cookies['admin'] },
        payload: { poolId },
      })
      const unfilledId = unfilled.json<ShiftRow>().id

      const response = await postConfirm(cookies['admin'], unfilledId)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>().code).toBe('oncall_invalid_shift_state')
    })

    it('rejects declining a non-declinable shift with 409', async () => {
      const unfilled = await app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie: cookies['admin'] },
        payload: { poolId },
      })
      const unfilledId = unfilled.json<ShiftRow>().id

      const response = await postDecline(cookies['admin'], unfilledId, { reason: 'no' })

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>().code).toBe('oncall_invalid_shift_state')
    })

    it('rejects confirm and decline after the shift started with 409', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie: cookies['admin'] },
        payload: { poolId, userId: oncallId, publish: true, startsAt: past, endsAt: future },
      })
      const shiftId = created.json<ShiftRow>().id

      const confirm = await postConfirm(cookies['oncall'], shiftId)
      const decline = await postDecline(cookies['oncall'], shiftId, { reason: 'late' })

      expect(confirm.statusCode).toBe(409)
      expect(confirm.json<ErrorResponseBody>().code).toBe('oncall_shift_started')
      expect(decline.statusCode).toBe(409)
      expect(decline.json<ErrorResponseBody>().code).toBe('oncall_shift_started')
    })

    it('rejects decline without a reason and with a too-short reason with 422', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const missing = await postDecline(cookies['oncall'], shiftId, {})
      const short = await postDecline(cookies['oncall'], shiftId, { reason: 'no' })
      const long = await postDecline(cookies['oncall'], shiftId, { reason: 'x'.repeat(501) })

      expect(missing.statusCode).toBe(422)
      expect(missing.json<ErrorResponseBody>().code).toBe('oncall_decline_reason_required')
      expect(short.statusCode).toBe(422)
      expect(short.json<ErrorResponseBody>().code).toBe('oncall_decline_reason_required')
      expect(long.statusCode).toBe(422)
      expect(long.json<ErrorResponseBody>().code).toBe('oncall_decline_reason_required')
    })

    it('accepts a 5-character reason', async () => {
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const response = await postDecline(cookies['oncall'], shiftId, { reason: 'abcde' })

      expect(response.statusCode).toBe(200)
      expect(response.json<ShiftRow>().state).toBe('DECLINED')
    })

    it('answers a repeated clientUuid with 200 and writes no second event', async () => {
      const clientUuid = '11111111-1111-4111-8111-111111111111'
      const created = await createPlannedShift(cookies['admin'], oncallId)
      const shiftId = created.json<ShiftRow>().id

      const first = await postConfirm(cookies['oncall'], shiftId, { clientUuid })
      expect(first.statusCode).toBe(200)
      expect(first.json<{ replayed?: boolean }>().replayed).toBeUndefined()

      const before = await eventsFor(shiftId)

      const second = await postConfirm(cookies['oncall'], shiftId, { clientUuid })
      expect(second.statusCode).toBe(200)

      const after = await eventsFor(shiftId)
      expect(after).toHaveLength(before.length)
    })

    it('rejects an unknown shift with 404', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000'

      const confirm = await postConfirm(cookies['oncall'], ghost)
      const decline = await postDecline(cookies['oncall'], ghost, { reason: 'no' })

      expect(confirm.statusCode).toBe(404)
      expect(confirm.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_shift_not_found',
        params: { fields: ['id'] },
      })
      expect(decline.statusCode).toBe(404)
      expect(decline.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_shift_not_found',
        params: { fields: ['id'] },
      })
    })

    it('rejects an invalid shift id with 400', async () => {
      const confirm = await postConfirm(cookies['oncall'], 'not-a-uuid')
      const decline = await postDecline(cookies['oncall'], 'not-a-uuid', { reason: 'no' })

      expect(confirm.statusCode).toBe(400)
      expect(confirm.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(decline.statusCode).toBe(400)
      expect(decline.json<ErrorResponseBody>().code).toBe('invalid_request')
    })
  },
)
