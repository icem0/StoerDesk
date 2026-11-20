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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call routes integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type MemberRow = {
  id: string
  givenName: string
  familyName: string
  email: string
}
type ShiftRow = {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
  technician?: MemberRow | null
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type SettingsBody = {
  weekStartWeekday: number
  startTime: string
  durationDays: number
  swapRequiresAdminApproval: boolean
  escalateToGroupAfterMin: number
  reminderUnconfirmedH: number
  unfilledWarningDays: number
  defaultPoolId: string | null
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call shift and settings routes (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let oncallId = ''
    let reporterId = ''
    let outsiderId = ''
    let poolId = ''
    const cookies: Record<'admin' | 'oncall' | 'reporter', string> = {
      admin: '',
      oncall: '',
      reporter: '',
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

    function getShifts(query?: Record<string, string>, cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/oncall/shifts',
        query,
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function getHistory(id: string, cookie?: string) {
      return app.inject({
        method: 'GET',
        url: `/api/v1/oncall/shifts/${id}/history`,
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function postShift(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie },
        payload,
      })
    }

    function postGenerate(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts/generate',
        headers: { cookie },
        payload,
      })
    }

    function patchShift(cookie: string, id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/oncall/shifts/${id}`,
        headers: { cookie },
        payload,
      })
    }

    function deleteShiftRoute(cookie: string, id: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/oncall/shifts/${id}`,
        headers: { cookie },
      })
    }

    function getSettings(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/oncall',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putSettings(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/oncall',
        headers: { cookie },
        payload,
      })
    }

    function patchPool(cookie: string, id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/oncall/pools/${id}`,
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-routes@example.org')
      oncallId = await userIdFor('oncall-routes@example.org')
      reporterId = await userIdFor('reporter-routes@example.org')

      // A technician who holds no role of the pool: the pool of the installation
      // has no group, so its members are the active users with the `oncall` role
      // and this outsider is nobody's member (`specs/04-oncall.md` §4a.2, §4a.3).
      const [outsider] = await db
        .insert(users)
        .values({
          email: 'outsider-routes@example.org',
          passwordHash: 'no-login-for-route-user',
          givenName: 'Otto',
          familyName: 'Outside',
        })
        .returning({ id: users.id })

      outsiderId = outsider!.id

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: oncallId, roleId: await roleIdFor('oncall') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Feuerwehr', groupId: null })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['oncall'] = await sessionCookieFor(oncallId)
      cookies['reporter'] = await sessionCookieFor(reporterId)

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
      const list = await getShifts()
      const settings = await getSettings()

      expect(list.statusCode).toBe(401)
      expect(list.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(settings.statusCode).toBe(401)
      expect(settings.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('refuses shift and settings access for roles without the matching permission', async () => {
      const oncallCreate = await postShift(cookies['oncall'], { poolId })
      const oncallPatch = await patchShift(
        cookies['oncall'],
        '00000000-0000-0000-0000-000000000000',
        {
          publish: true,
        },
      )
      const oncallDelete = await deleteShiftRoute(
        cookies['oncall'],
        '00000000-0000-0000-0000-000000000000',
      )
      const reporterList = await getShifts(undefined, cookies['reporter'])
      const reporterSettings = await getSettings(cookies['reporter'])
      const reporterPut = await putSettings(cookies['reporter'], { 'oncall.start_time': '08:00' })

      expect(oncallCreate.statusCode).toBe(403)
      expect(oncallCreate.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(oncallPatch.statusCode).toBe(403)
      expect(oncallDelete.statusCode).toBe(403)
      expect(reporterList.statusCode).toBe(403)
      expect(reporterSettings.statusCode).toBe(403)
      expect(reporterPut.statusCode).toBe(403)
    })

    it('lists an empty shift range for an oncall user', async () => {
      const response = await getShifts(
        { from: '2026-11-02T00:00:00.000Z', to: '2026-11-09T00:00:00.000Z' },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(200)
      expect(response.json<{ shifts: ShiftRow[] }>().shifts).toEqual([])
    })

    it('requires from and to on the shift range', async () => {
      const missingFrom = await getShifts({ to: '2026-11-09T00:00:00.000Z' }, cookies['oncall'])
      const missingTo = await getShifts({ from: '2026-11-02T00:00:00.000Z' }, cookies['oncall'])

      expect(missingFrom.statusCode).toBe(400)
      expect(missingFrom.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(missingTo.statusCode).toBe(400)
      expect(missingTo.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('rejects a range larger than 366 days with 422', async () => {
      const response = await getShifts(
        { from: '2026-01-01T00:00:00.000Z', to: '2027-01-02T00:00:00.000Z' },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_range_too_large',
        params: { fields: ['from', 'to'], maxDays: 366 },
      })
    })

    it('rejects an inverted range with 422', async () => {
      const response = await getShifts(
        { from: '2026-11-09T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorResponseBody>().code).toBe('oncall_range_too_large')
    })

    it('creates an UNFILLED shift as admin', async () => {
      const response = await postShift(cookies['admin'], { poolId })

      expect(response.statusCode).toBe(201)
      const body = response.json<ShiftRow>()
      expect(body.state).toBe('UNFILLED')
      expect(body.userId).toBeNull()
      expect(body.poolId).toBe(poolId)
      expect(typeof body.createdAt).toBe('string')
      expect(typeof body.updatedAt).toBe('string')
    })

    it('creates a PLANNED shift with publish and a technician', async () => {
      const response = await postShift(cookies['admin'], {
        poolId,
        userId: oncallId,
        publish: true,
      })

      expect(response.statusCode).toBe(201)
      const body = response.json<ShiftRow>()
      expect(body.state).toBe('PLANNED')
      expect(body.userId).toBe(oncallId)
    })

    it('lists created shifts in the requested range', async () => {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
      const response = await getShifts(
        { from: from.toISOString(), to: to.toISOString() },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(200)
      const body = response.json<{ shifts: ShiftRow[] }>()
      expect(body.shifts.length).toBeGreaterThanOrEqual(2)
      expect(body.shifts.every((shift) => shift.poolId === poolId)).toBe(true)
    })

    it('names the technician of every shift of the range (WP-M14-151)', async () => {
      const created = await postShift(cookies['admin'], {
        poolId,
        userId: outsiderId,
        publish: true,
      })

      expect(created.statusCode).toBe(201)

      const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
      const response = await getShifts(
        { from: from.toISOString(), to: to.toISOString() },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(200)
      const body = response.json<{ shifts: ShiftRow[] }>()
      const assigned = body.shifts.find((shift) => shift.userId === outsiderId)

      // the technician is no member of the pool, the name still travels with the
      // shift so the readiness calendar can name it (ADR-0032)
      expect(assigned?.technician).toEqual({
        id: outsiderId,
        givenName: 'Otto',
        familyName: 'Outside',
        email: 'outsider-routes@example.org',
      })

      const unstaffed = body.shifts.find((shift) => shift.userId === null)

      expect(unstaffed?.technician).toBeNull()
    })

    it('answers the named history of a shift (WP-M14-154a)', async () => {
      const created = await postShift(cookies['admin'], {
        poolId,
        userId: oncallId,
        publish: true,
      })
      const shiftId = created.json<ShiftRow>().id

      const reassigned = await patchShift(cookies['admin'], shiftId, {
        userId: outsiderId,
      })

      expect(reassigned.statusCode).toBe(200)

      const anonymous = await getHistory(shiftId)
      const forbidden = await getHistory(shiftId, cookies['reporter'])

      expect(anonymous.statusCode).toBe(401)
      expect(anonymous.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(forbidden.statusCode).toBe(403)
      expect(forbidden.json<ErrorResponseBody>().code).toBe('forbidden')

      const missing = await getHistory('00000000-0000-0000-0000-000000000000', cookies['oncall'])

      expect(missing.statusCode).toBe(404)
      expect(missing.json<ErrorResponseBody>().code).toBe('oncall_shift_not_found')

      const response = await getHistory(shiftId, cookies['oncall'])

      expect(response.statusCode).toBe(200)
      const body = response.json<{
        events: {
          type: string
          actor: MemberRow | null
          person: MemberRow | null
          fromState: string | null
          toState: string | null
          reason: string | null
        }[]
      }>()

      expect(body.events.map((event) => event.type)).toEqual(['shift_created', 'shift_updated'])
      expect(body.events[0]!.actor?.id).toBe(adminId)
      expect(body.events[0]!.person?.id).toBe(oncallId)
      expect(body.events[1]!.actor?.id).toBe(adminId)
      expect(body.events[1]!.person?.id).toBe(outsiderId)
      expect(body.events[1]!.person?.givenName).toBe('Otto')
      expect(body.events[1]!.fromState).toBe('PLANNED')
      expect(body.events[1]!.toState).toBe('DRAFT')
      expect(body.events[1]!.reason).toBeNull()
    })

    it('filters shifts by poolId', async () => {
      const response = await getShifts(
        {
          from: '2026-11-02T00:00:00.000Z',
          to: '2026-11-09T00:00:00.000Z',
          poolId: '00000000-0000-0000-0000-000000000000',
        },
        cookies['oncall'],
      )

      expect(response.statusCode).toBe(200)
      expect(response.json<{ shifts: ShiftRow[] }>().shifts).toEqual([])
    })

    it('publishes a DRAFT shift via PATCH', async () => {
      const draft = await postShift(cookies['admin'], { poolId })
      const draftId = draft.json<ShiftRow>().id

      const response = await patchShift(cookies['admin'], draftId, { publish: true })
      const body = response.json<ShiftRow>()

      expect(response.statusCode).toBe(200)
      expect(body.state).toBe('PLANNED')
    })

    it('rejects PATCH and DELETE on an unknown shift with 404', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000'
      const patch = await patchShift(cookies['admin'], ghost, { publish: true })
      const deleted = await deleteShiftRoute(cookies['admin'], ghost)

      expect(patch.statusCode).toBe(404)
      expect(patch.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_shift_not_found',
        params: { fields: ['id'] },
      })
      expect(deleted.statusCode).toBe(404)
      expect(deleted.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_shift_not_found',
        params: { fields: ['id'] },
      })
    })

    it('rejects PATCH with an invalid id and an invalid body', async () => {
      const badId = await patchShift(cookies['admin'], 'not-a-uuid', { publish: true })
      const badBody = await postShift(cookies['admin'], { poolId: 'not-a-uuid' })

      expect(badId.statusCode).toBe(400)
      expect(badId.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(badBody.statusCode).toBe(400)
      expect(badBody.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('deletes an UNFILLED shift', async () => {
      const created = await postShift(cookies['admin'], { poolId })
      const shiftId = created.json<ShiftRow>().id

      const deleted = await deleteShiftRoute(cookies['admin'], shiftId)

      expect(deleted.statusCode).toBe(204)

      const remaining = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, shiftId))

      expect(remaining).toHaveLength(0)
    })

    it('generates shifts idempotently', async () => {
      const first = await postGenerate(cookies['admin'], {
        poolId,
        from: '2026-11-02T00:00:00.000Z',
        to: '2026-11-09T06:00:00.000Z',
      })
      const firstBody = first.json<{ created: number; skipped: number }>()

      expect(first.statusCode).toBe(200)
      expect(firstBody.created).toBeGreaterThan(0)
      expect(firstBody.skipped).toBe(0)

      const second = await postGenerate(cookies['admin'], {
        poolId,
        from: '2026-11-02T00:00:00.000Z',
        to: '2026-11-09T06:00:00.000Z',
      })
      const secondBody = second.json<{ created: number; skipped: number }>()

      expect(second.statusCode).toBe(200)
      expect(secondBody.created).toBe(0)
      expect(secondBody.skipped).toBe(firstBody.created)
    })

    it('reads on-call settings with defaults', async () => {
      const response = await getSettings(cookies['oncall'])

      expect(response.statusCode).toBe(200)
      const body = response.json<SettingsBody>()
      expect(body.weekStartWeekday).toBe(1)
      expect(body.startTime).toBe('07:00')
      expect(body.durationDays).toBe(7)
      expect(body.defaultPoolId).toBeNull()
    })

    it('updates on-call settings and reads them back', async () => {
      const response = await putSettings(cookies['admin'], {
        'oncall.start_time': '08:00',
        'oncall.duration_days': 14,
      })
      const body = response.json<SettingsBody>()

      expect(response.statusCode).toBe(200)
      expect(body.startTime).toBe('08:00')
      expect(body.durationDays).toBe(14)
      expect(body.weekStartWeekday).toBe(1)

      const back = await getSettings(cookies['oncall'])
      const backBody = back.json<SettingsBody>()

      expect(backBody.startTime).toBe('08:00')
      expect(backBody.durationDays).toBe(14)
    })

    it('rejects a malformed settings patch with 400', async () => {
      const badTime = await putSettings(cookies['admin'], { 'oncall.start_time': 'not-a-time' })
      const badKey = await putSettings(cookies['admin'], { 'oncall.unknown_key': 1 })

      expect(badTime.statusCode).toBe(400)
      expect(badTime.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(badKey.statusCode).toBe(400)
      expect(badKey.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('writes the duty windows of a pool and reads them back', async () => {
      const windows = [
        { weekday: 1, start: '07:30', end: '17:00' },
        { weekday: 5, start: '07:00', end: '12:00' },
      ]
      const response = await patchPool(cookies['admin'], poolId, { weeklyWindows: windows })

      expect(response.statusCode).toBe(200)

      const back = await app.inject({
        method: 'GET',
        url: '/api/v1/oncall/pools',
        headers: { cookie: cookies['oncall'] },
      })
      const pool = back
        .json<{ pools: Array<{ id: string; weeklyWindows: typeof windows }> }>()
        .pools.find((row) => row.id === poolId)

      expect(back.statusCode).toBe(200)
      expect(pool?.weeklyWindows).toEqual(windows)
    })

    it('rejects a malformed duty window with 400', async () => {
      const backwards = await patchPool(cookies['admin'], poolId, {
        weeklyWindows: [{ weekday: 1, start: '17:00', end: '07:30' }],
      })
      const twice = await patchPool(cookies['admin'], poolId, {
        weeklyWindows: [
          { weekday: 1, start: '07:30', end: '17:00' },
          { weekday: 1, start: '09:00', end: '12:00' },
        ],
      })

      expect(backwards.statusCode).toBe(400)
      expect(backwards.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(twice.statusCode).toBe(400)
      expect(twice.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('creates one shift per duty window', async () => {
      await patchPool(cookies['admin'], poolId, {
        weeklyWindows: [
          { weekday: 1, start: '07:30', end: '17:00' },
          { weekday: 5, start: '07:00', end: '12:00' },
        ],
      })

      const generated = await postGenerate(cookies['admin'], {
        poolId,
        from: '2026-11-09T00:00:00.000Z',
        to: '2026-11-16T00:00:00.000Z',
      })

      expect(generated.statusCode).toBe(200)
      expect(generated.json<{ created: number }>().created).toBe(2)

      const shifts = await db
        .select({ startsAt: oncallShifts.startsAt, endsAt: oncallShifts.endsAt })
        .from(oncallShifts)
        .where(eq(oncallShifts.poolId, poolId))

      const windowShifts = shifts
        .map((shift) => ({
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
        }))
        .filter(
          (shift) =>
            shift.startsAt >= '2026-11-09T00:00:00.000Z' &&
            shift.startsAt < '2026-11-16T00:00:00.000Z',
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))

      expect(windowShifts).toEqual([
        { startsAt: '2026-11-09T06:30:00.000Z', endsAt: '2026-11-09T16:00:00.000Z' },
        { startsAt: '2026-11-13T06:00:00.000Z', endsAt: '2026-11-13T11:00:00.000Z' },
      ])

      // The continuous plan is the plan again - the pool keeps no window.
      const restored = await patchPool(cookies['admin'], poolId, { weeklyWindows: [] })

      expect(restored.statusCode).toBe(200)
      expect(restored.json<{ weeklyWindows: unknown[] }>().weeklyWindows).toEqual([])
    })
  },
)
