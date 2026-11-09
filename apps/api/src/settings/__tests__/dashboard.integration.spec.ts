import { eq, like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { verifyTvToken } from '../dashboard'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped dashboard settings integration: ${testDatabase.reason}\n`)
}

const { roles, settings, userRoles, users } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type DashboardSettingsBody = {
  tvToken: string
  tvAnonymize: boolean
  conspicuousThreshold: number
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'dashboard settings API — GET and PUT /api/v1/settings/dashboard (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
        key,
      ).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getDashboard(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/dashboard',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putDashboard(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/dashboard',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await db.delete(settings).where(like(settings.key, 'dashboard.%'))
      await db.delete(settings).where(like(settings.key, 'stats.%'))

      const adminId = await userIdFor('admin-dashboard@example.org')
      const officeId = await userIdFor('office-dashboard@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)

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

    it('answers 401 to an anonymous GET and PUT', async () => {
      expect((await getDashboard()).statusCode).toBe(401)
      expect((await putDashboard('session=invalid', {})).statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      const get = await getDashboard(cookies['office'])
      const put = await putDashboard(cookies['office'], {})

      expect(get.statusCode).toBe(200)
      expect(put.statusCode).toBe(403)
      expect(put.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('creates a token on the first GET and keeps it on the second', async () => {
      const first = await getDashboard(cookies['admin'])

      expect(first.statusCode).toBe(200)
      const firstBody = first.json<DashboardSettingsBody>()
      expect(firstBody.tvToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(firstBody.tvAnonymize).toBe(false)
      expect(firstBody.conspicuousThreshold).toBe(3)

      const second = await getDashboard(cookies['admin'])

      expect(second.statusCode).toBe(200)
      expect(second.json<DashboardSettingsBody>().tvToken).toBe(firstBody.tvToken)
    })

    it('rotates the token on rotateTvToken and updates thresholds', async () => {
      const before = await getDashboard(cookies['admin'])
      const beforeToken = before.json<DashboardSettingsBody>().tvToken

      const put = await putDashboard(cookies['admin'], {
        rotateTvToken: true,
        tvAnonymize: true,
        conspicuousThreshold: 7,
      })

      expect(put.statusCode).toBe(200)
      const putBody = put.json<DashboardSettingsBody>()
      expect(putBody.tvToken).not.toBe(beforeToken)
      expect(putBody.tvToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(putBody.tvAnonymize).toBe(true)
      expect(putBody.conspicuousThreshold).toBe(7)

      const after = await getDashboard(cookies['admin'])
      expect(after.json<DashboardSettingsBody>().tvToken).toBe(putBody.tvToken)
    })

    it('rejects an out-of-range conspicuous threshold', async () => {
      const response = await putDashboard(cookies['admin'], {
        conspicuousThreshold: 0,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['conspicuousThreshold'] },
      })

      const tooHigh = await putDashboard(cookies['admin'], {
        conspicuousThreshold: 101,
      })

      expect(tooHigh.statusCode).toBe(400)

      const unchanged = await getDashboard(cookies['admin'])
      expect(unchanged.json<DashboardSettingsBody>().conspicuousThreshold).toBe(7)
    })

    it('verifyTvToken accepts the stored token and rejects others', async () => {
      const get = await getDashboard(cookies['admin'])
      const token = get.json<DashboardSettingsBody>().tvToken

      expect(await verifyTvToken(db, token)).toBe(true)
      expect(await verifyTvToken(db, 'wrong-token')).toBe(false)
      expect(await verifyTvToken(db, token.slice(0, -1))).toBe(false)
      expect(await verifyTvToken(db, token + 'x')).toBe(false)
    })
  },
)
