import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AgentRun } from '@stoerdesk/shared'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { roles, updateRuns, userRoles, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped update routes integration: ${testDatabase.reason}\n`)
}

const AGENT_TOKEN = 'a'.repeat(32)

type StatusResponseBody = {
  agent?: { reachable?: boolean; state?: string | null }
  running?: boolean
  currentVersion?: string | null
  lastRun?: {
    id: string
    status: string
    errorCode: string | null
    errorDetail?: string | null
  } | null
}

type RunResponseBody = { run?: { id: string; status: string } }
type RunsResponseBody = {
  runs?: { id: string; status: string; errorDetail?: string | null }[]
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

/** A stand-in for the update agent: it speaks the protocol of §18.6. */
function startFakeAgent(): {
  url: string
  server: Server
  state: { lastRun: AgentRun | null; refuseRun: boolean }
} {
  const state: { lastRun: AgentRun | null; refuseRun: boolean } = {
    lastRun: null,
    refuseRun: false,
  }

  const server = createServer((request, response) => {
    const answer = (status: number, body: unknown) => {
      const payload = JSON.stringify(body)

      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(payload)
    }

    if (request.headers.authorization !== `Bearer ${AGENT_TOKEN}`) {
      answer(401, { code: 'unauthorized' })

      return
    }

    const path = new URL(request.url ?? '/', 'http://agent').pathname

    if (path === '/status') {
      answer(200, {
        state: state.lastRun?.status === 'RUNNING' ? 'running' : 'idle',
        checkout: { version: 'v0.1.99', commit: 'abc1234' },
        lastRun: state.lastRun,
      })

      return
    }

    if (path === '/run') {
      if (state.refuseRun) {
        answer(409, { code: 'update_already_running' })

        return
      }

      const run: AgentRun = {
        id: `agent-run-${Date.now()}`,
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        beforeVersion: 'v0.1.98',
        afterVersion: null,
        errorCode: null,
        errorDetail: null,
        steps: [],
      }

      state.lastRun = run
      answer(202, { run })

      return
    }

    if (path === '/runs') {
      answer(200, { runs: state.lastRun === null ? [] : [state.lastRun] })

      return
    }

    answer(404, { code: 'not_found' })
  })

  return { url: '', server, state }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'update admin API — status, run and history (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminCookie = ''
    let reporterCookie = ''
    const agent = startFakeAgent()

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-update-test' })
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

    function getStatus(cookie: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/update/status',
        headers: { cookie },
      })
    }

    function postRun(cookie: string) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/admin/update/run',
        headers: { cookie },
      })
    }

    function getRuns(cookie: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/admin/update/runs',
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

      await new Promise<void>((resolve) => {
        agent.server.listen(0, resolve)
      })

      const address = agent.server.address() as AddressInfo

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.UPDATE_AGENT_URL = `http://127.0.0.1:${address.port}`
      process.env.UPDATE_AGENT_TOKEN = AGENT_TOKEN

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await new Promise<void>((resolve) => {
        agent.server.close(() => resolve())
      })
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 for every route before the permission check', async () => {
      expect((await getStatus('')).statusCode).toBe(401)
      expect((await postRun('')).statusCode).toBe(401)
      expect((await getRuns('')).statusCode).toBe(401)
    })

    it('refuses every route without the permission system.update', async () => {
      expect((await getStatus(reporterCookie)).statusCode).toBe(403)
      expect((await postRun(reporterCookie)).statusCode).toBe(403)
      expect((await getRuns(reporterCookie)).statusCode).toBe(403)
    })

    it('answers the state of the agent', async () => {
      const response = await getStatus(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<StatusResponseBody>()

      expect(body.agent?.reachable).toBe(true)
      expect(body.currentVersion).toBe('v0.1.99')
      expect(body.running).toBe(false)
    })

    it('starts a run, writes the row and refuses a second run', async () => {
      const response = await postRun(adminCookie)

      expect(response.statusCode).toBe(202)

      const body = response.json<RunResponseBody>()

      expect(body.run?.status).toBe('RUNNING')

      const rows = await db.select().from(updateRuns)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.agentRunId).toBe(agent.state.lastRun?.id)
      expect(body.run?.id).toBe(rows[0]?.id)

      const second = await postRun(adminCookie)

      expect(second.statusCode).toBe(409)
      expect(second.json<ErrorResponseBody>()).toEqual({
        code: 'update_already_running',
        params: {},
      })
    })

    it('refuses a new run inside the cooldown', async () => {
      const [row] = await db.select().from(updateRuns).orderBy(updateRuns.startedAt)

      await db
        .update(updateRuns)
        .set({ status: 'SUCCESS', finishedAt: new Date() })
        .where(eq(updateRuns.id, row?.id ?? ''))

      const response = await postRun(adminCookie)

      expect(response.statusCode).toBe(429)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'update_rate_limited',
        params: {},
      })
    })

    it('reconciles a running row with the state of the agent', async () => {
      const agentRun = agent.state.lastRun

      agent.state.lastRun =
        agentRun === null
          ? null
          : {
              ...agentRun,
              status: 'SUCCESS',
              finishedAt: new Date().toISOString(),
              afterVersion: 'v0.1.99',
            }

      // The row of the run is still RUNNING: the API was replaced by the
      // rebuild of the stack before it could store the result.
      const rows = await db.select().from(updateRuns).orderBy(updateRuns.startedAt)
      const row = rows[rows.length - 1]

      await db
        .update(updateRuns)
        .set({ status: 'RUNNING', finishedAt: null, afterVersion: null })
        .where(eq(updateRuns.id, row?.id ?? ''))

      const response = await getStatus(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<StatusResponseBody>()

      expect(body.running).toBe(false)
      expect(body.lastRun?.status).toBe('SUCCESS')

      const reconciled = await db.select().from(updateRuns).orderBy(updateRuns.startedAt)
      const last = reconciled[reconciled.length - 1]

      expect(last?.status).toBe('SUCCESS')
      expect(last?.afterVersion).toBe('v0.1.99')
    })

    it('stores the failure detail of the agent run in the row and the answer', async () => {
      const agentRun = agent.state.lastRun

      if (agentRun === null) {
        throw new Error('expected an agent run of the previous test')
      }

      const row = onlyRow(await db.insert(updateRuns).values({}).returning(), 'run')

      agent.state.lastRun = {
        ...agentRun,
        id: 'agent-run-failed',
        status: 'FAILED',
        startedAt: row.startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        afterVersion: 'v0.1.98',
        errorCode: 'update_git_failed',
        errorDetail: 'fatal: Not possible to fast-forward, aborting.',
      }

      const response = await getStatus(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<StatusResponseBody>()

      expect(body.lastRun?.errorCode).toBe('update_git_failed')
      expect(body.lastRun?.errorDetail).toContain('Not possible to fast-forward')

      const stored = onlyRow(
        await db.select().from(updateRuns).where(eq(updateRuns.id, row.id)),
        'run',
      )

      expect(stored.status).toBe('FAILED')
      expect(stored.errorDetail).toBe('fatal: Not possible to fast-forward, aborting.')

      const history = await getRuns(adminCookie)

      expect(history.json<RunsResponseBody>().runs?.[0]?.errorDetail).toContain(
        'Not possible to fast-forward',
      )
    })

    it('answers the history of the runs', async () => {
      const response = await getRuns(adminCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<RunsResponseBody>()

      expect(body.runs?.length).toBeGreaterThan(0)
    })
  },
)
