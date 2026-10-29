import { eq } from 'drizzle-orm'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'

import { PERMISSION_KEYS } from '@stoerdesk/shared'
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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped auth routes integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

const credentials = { email: 'Login@Example.org', password: 'a-login-password' }

type WithCookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

function setCookieHeaders(response: WithCookieHeaders): string[] {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry))
  }

  return typeof raw === 'string' ? [raw] : []
}

/** The `name=value` pair of a `Set-Cookie` entry, reusable as a request cookie. */
function cookiePair(response: WithCookieHeaders, name: string): string | undefined {
  for (const entry of setCookieHeaders(response)) {
    const [pair] = entry.split(';')

    if (pair !== undefined && pair.startsWith(`${name}=`)) {
      return pair
    }
  }

  return undefined
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'auth routes — login, me, logout (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let userId = ''
    let sessionCookie = ''

    async function login(body?: Record<string, unknown>) {
      return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const inserted = await db
        .insert(users)
        .values({
          email: 'login@example.org',
          passwordHash: await hashPassword(credentials.password),
        })
        .returning({ id: users.id })

      userId = onlyRow(inserted, 'login user').id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (adminRole === undefined) {
        throw new Error('expected the seeded admin role')
      }

      await db.insert(userRoles).values({ userId, roleId: adminRole.id })

      // The server reads its database from the environment, so the test points it
      // at the throwaway database and keeps the log quiet.
      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('logs in with the seeded password and sets an httpOnly session cookie', async () => {
      const response = await login({ email: credentials.email, password: credentials.password })
      const body = response.json() as { user?: { id?: string; roles?: string[] } }

      expect(response.statusCode).toBe(200)
      expect(body.user?.id).toBe(userId)
      expect(body.user?.roles).toEqual(['admin'])

      const pair = cookiePair(response, 'session')

      expect(pair).toBeDefined()
      expect(pair).not.toContain(credentials.password)
      sessionCookie = pair ?? ''

      const cookieAttributes = setCookieHeaders(response).join('\n')

      expect(cookieAttributes).toContain('HttpOnly')
      expect(cookieAttributes).toContain('SameSite=Lax')
      expect(cookieAttributes).toContain('Max-Age=')
    })

    it('answers the identical 401 for a wrong password', async () => {
      const response = await login({ email: credentials.email, password: 'a-wrong-password' })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ code: 'invalid_credentials', params: {} })
    })

    it('answers the identical 401 for an unknown e-mail', async () => {
      const response = await login({ email: 'nobody@example.org', password: credentials.password })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ code: 'invalid_credentials', params: {} })
    })

    it('answers the identical 401 for a deactivated account', async () => {
      try {
        await db.update(users).set({ active: false }).where(eq(users.id, userId))

        const response = await login({ email: credentials.email, password: credentials.password })

        expect(response.statusCode).toBe(401)
        expect(response.json()).toEqual({ code: 'invalid_credentials', params: {} })
      } finally {
        await db.update(users).set({ active: true }).where(eq(users.id, userId))
      }
    })

    it('rejects /me without a session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/me' })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ code: 'session_invalid', params: {} })
    })

    it('returns the user, its role keys and its effective permissions for /me', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: sessionCookie },
      })
      const body = response.json<{
        user?: {
          id?: string
          email?: string
          locale?: string
          roles?: string[]
          permissions?: string[]
        }
      }>()

      expect(response.statusCode).toBe(200)
      expect(body.user).toMatchObject({
        id: userId,
        email: 'login@example.org',
        locale: 'de',
        roles: ['admin'],
      })

      // The admin role holds the whole catalog (`specs/01-rbac.md` §3.3).
      expect(body.user?.permissions).toEqual(expect.arrayContaining(PERMISSION_KEYS))
      expect(body.user?.permissions).toHaveLength(PERMISSION_KEYS.length)
    })

    it('clears the cookie on logout and drops the session row', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: sessionCookie },
      })
      const cleared = cookiePair(response, 'session')

      expect(response.statusCode).toBe(204)
      expect(cleared).toBe('session=')

      const afterLogout = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: sessionCookie },
      })

      expect(afterLogout.statusCode).toBe(401)

      const anonymousLogout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' })

      expect(anonymousLogout.statusCode).toBe(204)
    })

    it('rejects a malformed login body with the offending fields', async () => {
      const response = await login({ email: 'not-an-e-mail' })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        code: 'invalid_request',
        params: { fields: ['email', 'password'] },
      })
    })

    it('blocks the sixth login attempt of the minute with 429', async () => {
      const blocked = await login({ email: credentials.email, password: credentials.password })
      const alsoBlocked = await login({ email: credentials.email, password: credentials.password })

      expect(blocked.statusCode).toBe(429)
      expect(alsoBlocked.statusCode).toBe(429)
      expect(blocked.json()).toEqual({ code: 'rate_limited', params: { window: '1 minute' } })
    })
  },
)
