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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped password change me integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

const credentials = { email: 'change@example.org', password: 'an-old-password-of-mine' }

type WithCookieHeaders = { headers: Record<string, unknown> }

function cookiePair(response: WithCookieHeaders, name: string): string | undefined {
  const raw = response.headers['set-cookie']

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const [pair] = String(entry).split(';')

      if (pair !== undefined && pair.startsWith(`${name}=`)) {
        return pair
      }
    }

    return undefined
  }

  if (typeof raw === 'string') {
    const [pair] = raw.split(';')

    return pair !== undefined && pair.startsWith(`${name}=`) ? pair : undefined
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
  'auth routes — change own password (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let userId = ''
    let sessionCookie = ''

    async function signIn(email: string, password: string) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      })
    }

    async function changePassword(
      oldPassword: string,
      newPassword: string,
      cookie: string,
    ) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/users/me/password',
        headers: { cookie },
        payload: { oldPassword, newPassword },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (adminRole === undefined) {
        throw new Error('expected the seeded admin role')
      }

      const inserted = await db
        .insert(users)
        .values({
          email: credentials.email,
          passwordHash: await hashPassword(credentials.password),
        })
        .returning({ id: users.id })

      userId = onlyRow(inserted, 'change user').id

      await db.insert(userRoles).values({ userId, roleId: adminRole.id })

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

    it('rejects the request without a session cookie', async () => {
      const response = await changePassword(credentials.password, 'a-new-password-of-mine', '')

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ code: 'session_invalid', params: {} })
    })

    it('changes the password with the correct old one', async () => {
      const login = await signIn(credentials.email, credentials.password)

      expect(login.statusCode).toBe(200)
      sessionCookie = cookiePair(login, 'session') ?? ''

      const response = await changePassword(
        credentials.password,
        'a-new-password-of-mine',
        sessionCookie,
      )

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('rejects the old password after it was changed', async () => {
      const response = await signIn(credentials.email, credentials.password)

      expect(response.statusCode).toBe(401)

      const renewed = await signIn(credentials.email, 'a-new-password-of-mine')

      expect(renewed.statusCode).toBe(200)
      const renewedCookie = cookiePair(renewed, 'session') ?? ''

      const again = await changePassword(
        credentials.password,
        'yet-another-password-of-mine',
        renewedCookie,
      )

      expect(again.statusCode).toBe(400)
      expect(again.json()).toEqual({
        code: 'password_wrong',
        params: { fields: ['oldPassword'] },
      })
    })

    it('rejects a wrong old password with the right session', async () => {
      const response = await changePassword(
        'a-wrong-old-password',
        'a-new-password-of-mine',
        sessionCookie,
      )

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        code: 'password_wrong',
        params: { fields: ['oldPassword'] },
      })
    })

    it('rejects a new password that is too short', async () => {
      const response = await changePassword(
        'a-new-password-of-mine',
        'short',
        sessionCookie,
      )

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        code: 'invalid_request',
        params: { fields: ['newPassword'] },
      })
    })

    it('keeps the session of the current browser alive after the change', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
    })
  },
)
