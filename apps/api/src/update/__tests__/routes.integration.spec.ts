import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { roles, userRoles, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped update routes integration: ${testDatabase.reason}\n`)
}

const WEBHOOK_URL = 'http://127.0.0.1:9/hooks/deploy'
const WEBHOOK_TOKEN = 'deploy-token-value'
const INSTALLED_COMMIT = 'abc1234def5678'

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

type CheckResponseBody = {
  current?: string | null
  latest?: string | null
  updateAvailable?: boolean
  commitsBehind?: number | null
  commits?: { sha: string; message: string; date: string }[]
  checkedAt?: string
}

type FetchCall = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

const calls: FetchCall[] = []

/** The state of the fake GitHub and of the fake webhook. */
const upstream = {
  aheadBy: 2,
  compareStatus: 200,
  webhookStatus: 200,
  githubFails: false,
}

function commitPayload(sha: string, message: string, date: string) {
  return { sha, commit: { message, committer: { date }, author: { date } } }
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input)

      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: (init?.headers as Record<string, string>) ?? {},
        body: typeof init?.body === 'string' ? init.body : null,
      })

      if (url.includes('api.github.com')) {
        if (upstream.githubFails) {
          throw new Error('network down')
        }

        if (url.includes('/compare/')) {
          if (upstream.compareStatus !== 200) {
            return Response.json({ message: 'Not Found' }, { status: upstream.compareStatus })
          }

          return Response.json({
            ahead_by: upstream.aheadBy,
            commits: [
              commitPayload('aaa1111', 'feat(web): one', '2026-11-04T09:00:00Z'),
              commitPayload('bbb2222', 'fix(api): two', '2026-11-04T08:00:00Z'),
            ],
          })
        }

        return Response.json(
          commitPayload('abc1234def5678', 'fix(api): newest', '2026-11-04T10:00:00Z'),
        )
      }

      if (url.startsWith(WEBHOOK_URL)) {
        return Response.json({ ok: true }, { status: upstream.webhookStatus })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function githubCalls(): FetchCall[] {
  return calls.filter((call) => call.url.includes('api.github.com'))
}

function webhookCalls(): FetchCall[] {
  return calls.filter((call) => call.url.startsWith(WEBHOOK_URL))
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'update admin API — check and start (integration)',
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
        .values({ email, passwordHash: 'no-login-for-this-update-test' })
        .returning({ id: users.id })

      const [row] = inserted

      if (row === undefined) {
        throw new Error(`expected the user ${email}`)
      }

      return row.id
    }

    async function roleIdFor(key: string): Promise<string> {
      const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key))
      const [row] = rows

      if (row === undefined) {
        throw new Error(`expected the role ${key}`)
      }

      return row.id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getCheck(cookie: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/update/check',
        headers: { cookie },
      })
    }

    function postStart(cookie: string) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/admin/update/start',
        headers: { cookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-update@example.org')
      const reporterId = await userIdFor('reporter-update@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      adminCookie = await sessionCookieFor(adminId)
      reporterCookie = await sessionCookieFor(reporterId)
    })

    beforeEach(async () => {
      calls.length = 0
      upstream.aheadBy = 2
      upstream.compareStatus = 200
      upstream.webhookStatus = 200
      upstream.githubFails = false

      stubFetch()

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.GITHUB_REPO = 'icem0/StoerDesk'
      process.env.GITHUB_BRANCH = 'main'
      process.env.GITHUB_TOKEN = ''
      process.env.GIT_COMMIT = INSTALLED_COMMIT
      process.env.VERSION_FILE = '/nonexistent/VERSION'
      process.env.UPDATE_WEBHOOK_URL = WEBHOOK_URL
      process.env.UPDATE_WEBHOOK_TOKEN = WEBHOOK_TOKEN

      app = await buildServer()
    })

    afterEach(async () => {
      await app.close()
      vi.unstubAllGlobals()
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 for every route before the permission check', async () => {
      expect((await getCheck('')).statusCode).toBe(401)
      expect((await postStart('')).statusCode).toBe(401)
    })

    it('refuses every route without the permission system.update', async () => {
      expect((await getCheck(reporterCookie)).statusCode).toBe(403)
      expect((await postStart(reporterCookie)).statusCode).toBe(403)
    })

    it('answers the installed version, the newest commit and the commits behind', async () => {
      const response = await getCheck(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<CheckResponseBody>()

      expect(body.current).toBe(INSTALLED_COMMIT)
      expect(body.latest).toBe('abc1234')
      expect(body.updateAvailable).toBe(true)
      expect(body.commitsBehind).toBe(2)
      expect(body.commits).toHaveLength(2)
      expect(body.commits?.[0]?.message).toBe('feat(web): one')
      expect(body.checkedAt).toBeTruthy()
    })

    it('caches the answer for a minute', async () => {
      expect((await getCheck(adminCookie)).statusCode).toBe(200)
      expect((await getCheck(adminCookie)).statusCode).toBe(200)

      // The second request is answered from the cache: the newest commit and
      // the comparison are asked only once.
      expect(githubCalls()).toHaveLength(2)
    })

    it('answers that the versions cannot be compared when GitHub refuses it', async () => {
      upstream.compareStatus = 404

      const response = await getCheck(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<CheckResponseBody>()

      expect(body.commitsBehind).toBeNull()
      expect(body.updateAvailable).toBe(false)
      expect(body.commits).toEqual([])
    })

    it('reports a failing GitHub call', async () => {
      upstream.githubFails = true

      const response = await getCheck(adminCookie)

      expect(response.statusCode).toBe(503)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'update_check_failed',
        params: {},
      })
    })

    it('starts the update and calls the webhook', async () => {
      const response = await postStart(adminCookie)

      expect(response.statusCode).toBe(202)
      expect(response.json()).toEqual({ started: true })

      const [webhook] = webhookCalls()

      expect(webhook?.method).toBe('POST')
      expect(webhook?.headers['x-deploy-token']).toBe(WEBHOOK_TOKEN)

      const body = JSON.parse(webhook?.body ?? '{}') as Record<string, unknown>

      expect(body.version).toBe('abc1234')
      expect(body.current).toBe(INSTALLED_COMMIT)
      expect(Object.keys(body).sort()).toEqual(['current', 'requestedAt', 'version'])
    })

    it('refuses a second start inside the cooldown', async () => {
      expect((await postStart(adminCookie)).statusCode).toBe(202)

      const second = await postStart(adminCookie)

      expect(second.statusCode).toBe(429)
      expect(second.json<ErrorResponseBody>()).toEqual({
        code: 'update_rate_limited',
        params: {},
      })
      expect(webhookCalls()).toHaveLength(1)
    })

    it('refuses the start without an available update', async () => {
      upstream.aheadBy = 0

      const response = await postStart(adminCookie)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'update_no_update_available',
        params: {},
      })
      expect(webhookCalls()).toHaveLength(0)
    })

    it('refuses the start without a configured webhook', async () => {
      process.env.UPDATE_WEBHOOK_URL = ''

      await app.close()
      app = await buildServer()

      const response = await postStart(adminCookie)

      expect(response.statusCode).toBe(503)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'update_webhook_not_configured',
        params: {},
      })
    })

    it('reports a refused webhook', async () => {
      upstream.webhookStatus = 500

      const response = await postStart(adminCookie)

      expect(response.statusCode).toBe(502)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'update_webhook_failed',
        params: {},
      })
    })
  },
)
