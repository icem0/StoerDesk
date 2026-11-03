import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../../db/__tests__/helpers/testDatabase'
import * as schema from '../../../db/schema'
import { bmaSyncRuns, roles, settings, userRoles, users } from '../../../db/schema'
import { seedRbac } from '../../../db/seed-rbac'
import { buildServer } from '../../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped bma sync routes integration: ${testDatabase.reason}\n`)
}

type RunRow = {
  id: string
  startedAt: string
  finishedAt: string | null
  status: string
  total: number
  created: number
  updated: number
  unchanged: number
  deactivated: number
  conflicts: unknown
  errorCode: string | null
}

type RunsResponseBody = { runs?: RunRow[] }
type ScheduleResponseBody = { enabled?: boolean; cron?: string }
type CredentialsResponseBody = { configured?: boolean; source?: string }
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'BMAcloud admin API — runs, trigger and schedule (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminCookie = ''
    let reporterCookie = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-sync-test' })
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

    function getRuns(cookie: string, query = '') {
      return app.inject({
        method: 'GET',
        url: `/api/v1/admin/bma-sync/runs${query}`,
        headers: { cookie },
      })
    }

    function postRun(cookie: string) {
      return app.inject({ method: 'POST', url: '/api/v1/admin/bma-sync/run', headers: { cookie } })
    }

    function getSchedule(cookie: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/bma-sync/schedule',
        headers: { cookie },
      })
    }

    function patchSchedule(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/bma-sync/schedule',
        headers: { cookie },
        payload,
      })
    }

    function getCredentials(cookie: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/bma-sync/credentials',
        headers: { cookie },
      })
    }

    function putCredentials(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/admin/bma-sync/credentials',
        headers: { cookie },
        payload,
      })
    }

    function deleteCredentials(cookie: string) {
      return app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/bma-sync/credentials',
        headers: { cookie },
      })
    }

    async function insertRun(startedAt: Date, overrides: Record<string, unknown> = {}) {
      await db.insert(bmaSyncRuns).values({
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 1000),
        status: 'SUCCESS',
        total: 3,
        created: 1,
        updated: 1,
        unchanged: 1,
        deactivated: 0,
        conflicts: [],
        ...overrides,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-bma@example.org')
      const reporterId = await userIdFor('reporter-bma@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      adminCookie = await sessionCookieFor(adminId)
      reporterCookie = await sessionCookieFor(reporterId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      // The manual trigger must refuse before any request and any run row.
      process.env.BMA_API_KEY = ''
      // Unreachable on purpose: a stored key may reach the client but never the network.
      process.env.BMA_API_BASE_URL = 'http://127.0.0.1:1/'
      // Deterministic environment half of the schedule fallback (WP-M2-36b).
      process.env.BMA_SYNC_ENABLED = 'false'
      process.env.BMA_SYNC_CRON = '0 5 * * 2'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 for every route before the permission check', async () => {
      const list = await getRuns('')
      const run = await postRun('')
      const readSchedule = await getSchedule('')
      const schedule = await patchSchedule('', { enabled: true, cron: '15 3 * * *' })

      expect(list.statusCode).toBe(401)
      expect(list.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(run.statusCode).toBe(401)
      expect(readSchedule.statusCode).toBe(401)
      expect(schedule.statusCode).toBe(401)
    })

    it('reads runs and the schedule with object.read but refuses the trigger and the schedule write', async () => {
      const list = await getRuns(reporterCookie)
      const run = await postRun(reporterCookie)
      const readSchedule = await getSchedule(reporterCookie)
      const schedule = await patchSchedule(reporterCookie, { enabled: true, cron: '15 3 * * *' })

      expect(list.statusCode).toBe(200)
      expect(list.json<RunsResponseBody>().runs).toEqual([])
      expect(run.statusCode).toBe(403)
      expect(run.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(readSchedule.statusCode).toBe(200)
      expect(schedule.statusCode).toBe(403)
    })

    it('refuses the manual trigger without an API key and writes no run row', async () => {
      const response = await postRun(adminCookie)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'bma_not_configured', params: {} })

      expect(await db.select({ id: bmaSyncRuns.id }).from(bmaSyncRuns)).toHaveLength(0)
    })

    it('answers 401 on the credential routes before the permission check', async () => {
      const read = await getCredentials('')
      const write = await putCredentials('', { apiKey: 'deadbeef' })
      const remove = await deleteCredentials('')

      expect(read.statusCode).toBe(401)
      expect(read.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(write.statusCode).toBe(401)
      expect(remove.statusCode).toBe(401)
    })

    it('reads the credential status with object.read but refuses the write and delete', async () => {
      const read = await getCredentials(reporterCookie)
      const write = await putCredentials(reporterCookie, { apiKey: 'deadbeef' })
      const remove = await deleteCredentials(reporterCookie)

      expect(read.statusCode).toBe(200)
      expect(read.json<CredentialsResponseBody>()).toEqual({ configured: false, source: 'none' })
      expect(write.statusCode).toBe(403)
      expect(write.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(remove.statusCode).toBe(403)
    })

    it('refuses an empty and an oversized key with the field path only', async () => {
      const empty = await putCredentials(adminCookie, { apiKey: '   ' })
      const long = await putCredentials(adminCookie, { apiKey: 'a'.repeat(513) })

      expect(empty.statusCode).toBe(400)
      expect(empty.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['apiKey'] },
      })
      expect(long.statusCode).toBe(400)
      expect(long.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['apiKey'] },
      })
    })

    it('stores the key without echoing it and lets the trigger reach the client', async () => {
      const write = await putCredentials(adminCookie, { apiKey: '  deadbeef  ' })

      expect(write.statusCode).toBe(200)
      expect(write.json<CredentialsResponseBody>()).toEqual({ configured: true, source: 'db' })
      expect(JSON.stringify(write.json())).not.toContain('deadbeef')

      const stored = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(eq(settings.key, 'bma.api.key'))

      expect(onlyRow(stored, 'bma.api.key').value).toBe('deadbeef')

      const read = await getCredentials(adminCookie)

      expect(read.json<CredentialsResponseBody>()).toEqual({ configured: true, source: 'db' })

      // The stored key is effective without a restart: the trigger reaches the
      // unreachable base URL instead of answering 409, and still writes no run row.
      const run = await postRun(adminCookie)

      expect(run.statusCode).toBe(502)
      expect(run.json<ErrorResponseBody>()).toEqual({ code: 'bma_request_failed', params: {} })
      expect(await db.select({ id: bmaSyncRuns.id }).from(bmaSyncRuns)).toHaveLength(0)
    })

    it('deletes the stored key so the empty environment leaves the state unconfigured', async () => {
      const removed = await deleteCredentials(adminCookie)

      expect(removed.statusCode).toBe(200)
      expect(removed.json<CredentialsResponseBody>()).toEqual({
        configured: false,
        source: 'none',
      })

      const stored = await db
        .select({ key: settings.key })
        .from(settings)
        .where(eq(settings.key, 'bma.api.key'))

      expect(stored).toHaveLength(0)
    })

    it('answers the effective schedule pair before anything was stored', async () => {
      const response = await getSchedule(adminCookie)

      expect(response.statusCode).toBe(200)
      expect(response.json<ScheduleResponseBody>()).toEqual({
        enabled: false,
        cron: '0 5 * * 2',
      })
    })

    it('stores the schedule pair and answers the effective pair again', async () => {
      const response = await patchSchedule(adminCookie, {
        enabled: false,
        cron: '0 4 * * 1',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<ScheduleResponseBody>()).toEqual({ enabled: false, cron: '0 4 * * 1' })

      const stored = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(eq(settings.key, 'bma.sync.enabled'))

      expect(onlyRow(stored, 'bma.sync.enabled').value).toBe(false)

      const again = await patchSchedule(adminCookie, {
        enabled: true,
        cron: '15 3 * * *',
      })

      expect(again.json<ScheduleResponseBody>()).toEqual({ enabled: true, cron: '15 3 * * *' })

      const readBack = await getSchedule(adminCookie)

      expect(readBack.json<ScheduleResponseBody>()).toEqual({ enabled: true, cron: '15 3 * * *' })
    })

    it('rejects an invalid cron and an invalid limit with field paths only', async () => {
      const badCron = await patchSchedule(adminCookie, { enabled: true, cron: 'every day' })
      const badLimit = await getRuns(adminCookie, '?limit=0')

      expect(badCron.statusCode).toBe(400)
      expect(badCron.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['cron'] },
      })
      expect(badLimit.statusCode).toBe(400)
      expect(badLimit.json<ErrorResponseBody>().params?.fields).toEqual(['limit'])
    })

    it('lists the newest runs first and honours the limit', async () => {
      await insertRun(new Date('2026-11-01T03:15:00Z'), { status: 'PARTIAL' })
      await insertRun(new Date('2026-11-02T03:15:00Z'), {
        status: 'FAILED',
        errorCode: 'bma_sync_failed',
        created: 0,
        updated: 0,
        unchanged: 0,
      })
      await insertRun(new Date('2026-11-03T03:15:00Z'), {
        conflicts: [
          { code: 'object_no_taken', objectNo: '10372_01', aid: 'aid-9', detail: 'local_object' },
        ],
      })

      const all = await getRuns(adminCookie)
      const runs = all.json<RunsResponseBody>().runs ?? []

      expect(all.statusCode).toBe(200)
      expect(runs.map((run) => run.startedAt)).toEqual([
        '2026-11-03T03:15:00.000Z',
        '2026-11-02T03:15:00.000Z',
        '2026-11-01T03:15:00.000Z',
      ])
      expect(runs[0]?.conflicts).toEqual([
        { code: 'object_no_taken', objectNo: '10372_01', aid: 'aid-9', detail: 'local_object' },
      ])
      expect(runs[1]).toMatchObject({ status: 'FAILED', errorCode: 'bma_sync_failed' })

      const limited = await getRuns(adminCookie, '?limit=1')

      expect(limited.json<RunsResponseBody>().runs).toHaveLength(1)
    })
  },
)
