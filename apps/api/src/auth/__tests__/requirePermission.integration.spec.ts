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
import { createSession } from '../session'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped requirePermission integration: ${testDatabase.reason}\n`)
}

const { permissions, roles, userPermissions, userRoles, users } = schema

type ProbeBody = { allowed?: boolean; code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'requirePermission — effective permissions (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<string, string> = {}

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-probe-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function permissionIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.key, key)),
        key,
      ).id
    }

    async function sessionCookieOf(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function probe(keys: string, cookie?: string) {
      return app.inject({
        method: 'GET',
        url: `/api/v1/_test/require-permission/${keys}`,
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminRoleId = await roleIdFor('admin')

      const admin = await userIdFor('admin-probe@example.org')
      const plain = await userIdFor('plain-probe@example.org')
      const limited = await userIdFor('limited-probe@example.org')
      const denied = await userIdFor('denied-probe@example.org')

      await db.insert(userRoles).values([
        { userId: admin, roleId: adminRoleId },
        { userId: denied, roleId: adminRoleId },
      ])

      // `limited` has no role at all — only one explicit allow.
      await db
        .insert(userPermissions)
        .values({
          userId: limited,
          permissionId: await permissionIdFor('ticket.read'),
          effect: 'allow',
        })

      // A single denial beats the whole admin union for that key.
      await db
        .insert(userPermissions)
        .values({
          userId: denied,
          permissionId: await permissionIdFor('user.write'),
          effect: 'deny',
        })

      cookies['admin'] = await sessionCookieOf(admin)
      cookies['plain'] = await sessionCookieOf(plain)
      cookies['limited'] = await sessionCookieOf(limited)
      cookies['denied'] = await sessionCookieOf(denied)

      // The server reads its database and its environment from the process, so the
      // test points it at the throwaway database and enables the probe routes.
      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
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

    it('answers 401 for an anonymous request, before any permission check', async () => {
      const response = await probe('user.write')

      expect(response.statusCode).toBe(401)
      expect(response.json<ProbeBody>().code).toBe('session_invalid')
    })

    it('lets the admin role through for user.write', async () => {
      const response = await probe('user.write', cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<ProbeBody>().allowed).toBe(true)
    })

    it('answers 403 for a user without any role', async () => {
      const response = await probe('ticket.read', cookies['plain'])

      expect(response.statusCode).toBe(403)
      expect(response.json<ProbeBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('treats several permissions as OR — the explicit allow is enough', async () => {
      const allowed = await probe('user.write,ticket.read', cookies['limited'])
      const rejected = await probe('user.write,role.write', cookies['limited'])

      expect(allowed.statusCode).toBe(200)
      expect(rejected.statusCode).toBe(403)
      expect(rejected.json<ProbeBody>().code).toBe('forbidden')
    })

    it('lets an explicit denial beat the admin role union', async () => {
      const deniedWrite = await probe('user.write', cookies['denied'])
      const stillAllowed = await probe('role.write', cookies['denied'])

      expect(deniedWrite.statusCode).toBe(403)
      expect(stillAllowed.statusCode).toBe(200)
    })

    it('lists the effective permissions of the user in /me, sorted', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: cookies['limited'] },
      })
      const body = response.json<{ user?: { roles?: string[]; permissions?: string[] } }>()

      expect(response.statusCode).toBe(200)
      expect(body.user?.roles).toEqual([])
      expect(body.user?.permissions).toEqual(['ticket.read'])
    })

    it('rejects a key that is not part of the catalog with 403', async () => {
      const response = await probe('not.a.permission', cookies['admin'])

      expect(response.statusCode).toBe(403)
    })
  },
)
