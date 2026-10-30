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
  process.stderr.write(`skipped admin roles integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type RoleSummary = {
  id: string
  key: string
  isSystem: boolean
  permissionKeys: string[]
  userCount: number
}

type RolesResponseBody = { roles?: RoleSummary[] }
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type MeResponseBody = { user?: { permissions?: string[]; roles?: string[] } }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'admin roles API — role CRUD and permission assignment (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let holderId = ''
    const cookies: Record<'admin' | 'office' | 'holder', string> = {
      admin: '',
      office: '',
      holder: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-admin-role' })
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

    function getRoles(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function postRoles(cookie: string, payload: Record<string, unknown>) {
      return app.inject({ method: 'POST', url: '/api/v1/roles', headers: { cookie }, payload })
    }

    function patchRole(cookie: string, key: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/roles/${key}`,
        headers: { cookie },
        payload,
      })
    }

    function deleteRole(cookie: string, key: string) {
      return app.inject({ method: 'DELETE', url: `/api/v1/roles/${key}`, headers: { cookie } })
    }

    function getMe(cookie: string) {
      return app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })
    }

    function roleOf(body: RolesResponseBody, key: string): RoleSummary {
      const [role] = (body.roles ?? []).filter((entry) => entry.key === key)

      if (role === undefined) {
        throw new Error(`expected role ${key}`)
      }

      return role
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-roles@example.org')
      holderId = await userIdFor('holder-roles@example.org')
      const officeId = await userIdFor('office-roles@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)
      cookies['holder'] = await sessionCookieFor(holderId)

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
      const response = await getRoles()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('refuses the role list for a role without role.read', async () => {
      const list = await getRoles(cookies['office'])
      const create = await postRoles(cookies['office'], { key: 'sneaky', permissionKeys: [] })

      expect(list.statusCode).toBe(403)
      expect(list.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(create.statusCode).toBe(403)
    })

    it('lists the seeded system roles with their grant counts', async () => {
      const response = await getRoles(cookies['admin'])
      const body = response.json<RolesResponseBody>()

      expect(response.statusCode).toBe(200)
      expect(body.roles).toHaveLength(5)

      const expected: Record<string, number> = {
        reporter_internal: 8,
        office: 19,
        oncall: 15,
        manager: 12,
        admin: 37,
      }

      for (const [key, grants] of Object.entries(expected)) {
        const role = roleOf(body, key)

        expect(role.isSystem).toBe(true)
        expect(role.permissionKeys).toHaveLength(grants)
        expect(role.permissionKeys).toEqual([...role.permissionKeys].sort())
      }

      expect(roleOf(body, 'admin').userCount).toBe(1)
    })

    it('creates a custom role and grants the requested permission keys', async () => {
      const response = await postRoles(cookies['admin'], {
        key: 'stats_viewer',
        permissionKeys: ['stats.export', 'ticket.read', 'ticket.read'],
      })

      expect(response.statusCode).toBe(201)
      expect(response.json<RoleSummary>()).toEqual({
        id: expect.any(String),
        key: 'stats_viewer',
        isSystem: false,
        permissionKeys: ['stats.export', 'ticket.read'],
        userCount: 0,
      })

      const list = await getRoles(cookies['admin'])

      expect(roleOf(list.json<RolesResponseBody>(), 'stats_viewer').isSystem).toBe(false)
    })

    it('rejects an unknown permission key before anything is written', async () => {
      const response = await postRoles(cookies['admin'], {
        key: 'broken_role',
        permissionKeys: ['ticket.read', 'ticket.nope'],
      })
      const body = response.json<ErrorResponseBody>()

      expect(response.statusCode).toBe(422)
      expect(body.code).toBe('unknown_permission_key')
      expect(body.params).toEqual({
        fields: ['permissionKeys'],
        permissionKeys: ['ticket.nope'],
      })

      const list = await getRoles(cookies['admin'])

      expect((list.json<RolesResponseBody>().roles ?? []).map((role) => role.key)).not.toContain(
        'broken_role',
      )
    })

    it('rejects an existing key and a reserved system key', async () => {
      const duplicate = await postRoles(cookies['admin'], {
        key: 'stats_viewer',
        permissionKeys: [],
      })
      const reserved = await postRoles(cookies['admin'], { key: 'office', permissionKeys: [] })

      expect(duplicate.statusCode).toBe(409)
      expect(duplicate.json<ErrorResponseBody>()).toEqual({
        code: 'role_key_taken',
        params: { fields: ['key'] },
      })
      expect(reserved.statusCode).toBe(409)
      expect(reserved.json<ErrorResponseBody>().code).toBe('role_key_taken')
    })

    it('rejects an invalid body with field paths only', async () => {
      const response = await postRoles(cookies['admin'], {
        key: 'Bad Role',
        permissionKeys: 'ticket.read',
      })
      const body = response.json<ErrorResponseBody>()

      expect(response.statusCode).toBe(400)
      expect(body.code).toBe('invalid_request')
      expect(body.params?.fields).toEqual(expect.arrayContaining(['key', 'permissionKeys']))
    })

    it('replaces grants and acts on the next request without a new login', async () => {
      await db
        .insert(userRoles)
        .values({ userId: holderId, roleId: await roleIdFor('stats_viewer') })

      const before = await getMe(cookies['holder'])

      expect(before.json<MeResponseBody>().user?.permissions).toEqual([
        'stats.export',
        'ticket.read',
      ])

      const response = await patchRole(cookies['admin'], 'stats_viewer', {
        permissionKeys: ['ticket.read'],
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<RoleSummary>()).toMatchObject({
        key: 'stats_viewer',
        isSystem: false,
        permissionKeys: ['ticket.read'],
        userCount: 1,
      })

      const after = await getMe(cookies['holder'])

      expect(after.json<MeResponseBody>().user?.permissions).toEqual(['ticket.read'])
      expect(after.json<MeResponseBody>().user?.roles).toEqual(['stats_viewer'])
    })

    it('protects system roles and reports unknown roles', async () => {
      const system = await patchRole(cookies['admin'], 'office', { permissionKeys: [] })
      const unknown = await patchRole(cookies['admin'], 'ghost_role', { permissionKeys: [] })
      const badKey = await patchRole(cookies['admin'], 'Bad Key', { permissionKeys: [] })

      expect(system.statusCode).toBe(409)
      expect(system.json<ErrorResponseBody>()).toEqual({
        code: 'system_role_protected',
        params: { fields: ['key'] },
      })
      expect(unknown.statusCode).toBe(404)
      expect(unknown.json<ErrorResponseBody>()).toEqual({
        code: 'role_not_found',
        params: { fields: ['key'] },
      })
      expect(badKey.statusCode).toBe(400)
      expect(badKey.json<ErrorResponseBody>().params?.fields).toEqual(['key'])

      const officeGrantsAfter = roleOf(
        (await getRoles(cookies['admin'])).json<RolesResponseBody>(),
        'office',
      )

      expect(officeGrantsAfter.permissionKeys).toHaveLength(19)
    })

    it('refuses to delete a protected or still assigned role and then removes it', async () => {
      const assigned = await deleteRole(cookies['admin'], 'stats_viewer')
      const system = await deleteRole(cookies['admin'], 'admin')

      expect(assigned.statusCode).toBe(409)
      expect(assigned.json<ErrorResponseBody>()).toEqual({
        code: 'role_in_use',
        params: { fields: ['key'], userCount: 1 },
      })
      expect(system.statusCode).toBe(409)
      expect(system.json<ErrorResponseBody>().code).toBe('system_role_protected')

      await db.delete(userRoles).where(eq(userRoles.userId, holderId))

      const removed = await deleteRole(cookies['admin'], 'stats_viewer')

      expect(removed.statusCode).toBe(204)

      const list = await getRoles(cookies['admin'])

      expect(list.json<RolesResponseBody>().roles).toHaveLength(5)

      const grantRows = await db
        .select({ roleId: schema.rolePermissions.roleId })
        .from(schema.rolePermissions)
        .innerJoin(roles, eq(roles.id, schema.rolePermissions.roleId))
        .where(eq(roles.key, 'stats_viewer'))

      expect(grantRows).toHaveLength(0)
    })
  },
)
