import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { hashPassword } from '../password'
import { createSession } from '../session'

/**
 * The one-time password of the administration (`specs/01-rbac.md` §3.9,
 * ADR-0031): the account may log in, but it may not work before the user sets
 * a password of their own.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped password change integration: ${testDatabase.reason}\n`)
}

const { roles, sessions, userRoles, users } = schema

const temporaryPassword = 'a-temporary-password'
const ownPassword = 'a-password-of-my-own'

type MeBody = { user?: { mustChangePassword?: boolean } }
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the open password change — the flag, the block and the own password (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let userId = ''
    let sessionCookie = ''

    async function login(password: string) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'pending@example.org', password },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const inserted = await db
        .insert(users)
        .values({
          email: 'pending@example.org',
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        })
        .returning({ id: users.id })

      userId = onlyRow(inserted, 'the pending user').id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (adminRole === undefined) {
        throw new Error('expected the seeded admin role')
      }

      await db.insert(userRoles).values({ userId, roleId: adminRole.id })

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'
      process.env.LOGIN_RATE_LIMIT_MAX = '100'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('logs in with the one-time password and names the open password change', async () => {
      const response = await login(temporaryPassword)
      const body = response.json<MeBody>()

      expect(response.statusCode).toBe(200)
      expect(body.user?.mustChangePassword).toBe(true)

      const pair = response.headers['set-cookie']
      const cookie = Array.isArray(pair) ? pair[0] : pair

      expect(cookie).toBeDefined()
      sessionCookie = String(cookie).split(';')[0] ?? ''
    })

    it('blocks the guarded routes while the flag is set', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { cookie: sessionCookie },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<ErrorBody>()).toEqual({
        code: 'password_change_required',
        params: {},
      })
    })

    it('keeps the me endpoint readable and names the flag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: sessionCookie },
      })
      const body = response.json<MeBody>()

      expect(response.statusCode).toBe(200)
      expect(body.user?.mustChangePassword).toBe(true)
    })

    it('sets the own password, clears the flag and ends the sessions of the other devices', async () => {
      const otherDevice = await createSession(db, userId, 1)
      const otherCookie = `session=${otherDevice.token}`

      const change = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { cookie: sessionCookie },
        payload: { password: ownPassword },
      })

      expect(change.statusCode).toBe(200)
      expect(change.json<{ mustChangePassword?: boolean }>().mustChangePassword).toBe(false)

      const stored = await db
        .select({ mustChangePassword: users.mustChangePassword })
        .from(users)
        .where(eq(users.id, userId))

      expect(stored).toEqual([{ mustChangePassword: false }])

      const otherSession = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.tokenHash, otherDevice.token))

      expect(otherSession).toEqual([])

      const otherAnswer = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: otherCookie },
      })

      expect(otherAnswer.statusCode).toBe(401)
    })

    it('opens the guarded routes after the own password and drops the one-time password', async () => {
      const guarded = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { cookie: sessionCookie },
      })

      expect(guarded.statusCode).toBe(200)

      const withTemporary = await login(temporaryPassword)
      const withOwn = await login(ownPassword)

      expect(withTemporary.statusCode).toBe(401)
      expect(withOwn.statusCode).toBe(200)
      expect(withOwn.json<MeBody>().user?.mustChangePassword).toBe(false)
    })
  },
)
