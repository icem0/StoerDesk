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

    function patchSchedule(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/bma-sync/schedule',
        headers: { cookie },
        payload,
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
      const schedule = await patchSchedule('', { enabled: true, cron: '15 3 * * *' })

      expect(list.statusCode).toBe(401)
      expect(list.json<ErrorResponseBody>().code).toBe('session_invalid')
      expect(run.statusCode).toBe(401)
      expect(schedule.statusCode).toBe(401)
    })

    it('reads runs with object.read but refuses the trigger and the schedule', async () => {
      const list = await getRuns(reporterCookie)
      const run = await postRun(reporterCookie)
      const schedule = await patchSchedule(reporterCookie, { enabled: true, cron: '15 3 * * *' })

      expect(list.statusCode).toBe(200)
      expect(list.json<RunsResponseBody>().runs).toEqual([])
      expect(run.statusCode).toBe(403)
      expect(run.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(schedule.statusCode).toBe(403)
    })

    it('refuses the manual trigger without an API key and writes no run row', async () => {
      const response = await postRun(adminCookie)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'bma_not_configured', params: {} })

      expect(await db.select({ id: bmaSyncRuns.id }).from(bmaSyncRuns)).toHaveLength(0)
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
