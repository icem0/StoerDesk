import { eq } from 'drizzle-orm'
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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped admin users integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type UserSummary = {
  id: string
  email: string
  locale: string
  active: boolean
  roleKeys: string[]
}

type UserResponseBody = Partial<UserSummary>
type UsersResponseBody = { users?: UserResponseBody[] }
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'admin users API — list, create and update (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let officeId = ''
    let createdId = ''
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-admin-user' })
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

    function getUsers(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function postUsers(cookie: string, payload: Record<string, unknown>) {
      return app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload })
    }

    function patchUser(cookie: string, id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${id}`,
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-api@example.org')
      officeId = await userIdFor('office-api@example.org')

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

    it('answers 401 before any permission check for an anonymous request', async () => {
      const response = await getUsers()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('lists users and role keys for an admin without password hashes', async () => {
      const response = await getUsers(cookies['admin'])
      const body = response.json<UsersResponseBody & { passwordHash?: string }>()

      expect(response.statusCode).toBe(200)
      expect(body.users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: adminId,
            email: 'admin-api@example.org',
            roleKeys: ['admin'],
          }),
          expect.objectContaining({
            id: officeId,
            email: 'office-api@example.org',
            roleKeys: ['office'],
          }),
        ]),
      )
      expect(JSON.stringify(body)).not.toContain('passwordHash')
    })

    it('allows office to read users but rejects create with 403', async () => {
      const list = await getUsers(cookies['office'])
      const create = await postUsers(cookies['office'], {
        email: 'forbidden@example.org',
        password: 'a-test-password',
        roleKeys: ['office'],
      })

      expect(list.statusCode).toBe(200)
      expect(list.json<UsersResponseBody>().users).toHaveLength(2)
      expect(create.statusCode).toBe(403)
      expect(create.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('creates an active user and assigns roles in one call', async () => {
      const response = await postUsers(cookies['admin'], {
        email: 'NewUser@Example.org',
        password: 'a-test-password',
        roleKeys: ['office', 'oncall'],
      })

      expect(response.statusCode).toBe(201)
      expect(response.json<UserResponseBody>()).toEqual({
        id: expect.any(String),
        email: 'newuser@example.org',
        locale: 'de',
        active: true,
        roleKeys: ['office', 'oncall'],
      })

      createdId = response.json<UserResponseBody>().id ?? ''
    })

    it('rejects a duplicate e-mail without revealing the stored account', async () => {
      const response = await postUsers(cookies['admin'], {
        email: 'newuser@example.org',
        password: 'a-test-password',
        roleKeys: ['reporter_internal'],
      })

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'email_taken',
        params: { fields: ['email'] },
      })
    })

    it('updates role keys for an existing user', async () => {
      const response = await patchUser(cookies['admin'], createdId, { roleKeys: ['oncall'] })

      expect(response.statusCode).toBe(200)
      expect(response.json<UserResponseBody>()).toMatchObject({
        id: createdId,
        email: 'newuser@example.org',
        active: true,
        roleKeys: ['oncall'],
      })
    })

    it('rejects an invalid create body with field paths only', async () => {
      const response = await postUsers(cookies['admin'], {
        email: 'not-an-e-mail',
        password: 'short',
        roleKeys: [''],
      })
      const body = response.json<ErrorResponseBody>()

      expect(response.statusCode).toBe(400)
      expect(body.params?.fields).toEqual(
        expect.arrayContaining(['email', 'password', 'roleKeys.0']),
      )
    })

    it('does not let the last active admin be deactivated or un-roled', async () => {
      const deactivated = await patchUser(cookies['admin'], adminId, { active: false })
      const unroled = await patchUser(cookies['admin'], adminId, { roleKeys: [] })

      expect(deactivated.statusCode).toBe(409)
      expect(deactivated.json<ErrorResponseBody>()).toEqual({
        code: 'last_admin',
        params: { fields: ['id'] },
      })

      expect(unroled.statusCode).toBe(409)
      expect(unroled.json<ErrorResponseBody>().code).toBe('last_admin')

      const adminAfter = await db
        .select({ active: users.active, roleKey: roles.key })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(users.id, adminId))

      expect(adminAfter).toEqual([{ active: true, roleKey: 'admin' }])
    })
  },
)
