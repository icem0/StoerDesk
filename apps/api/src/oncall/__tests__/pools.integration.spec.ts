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
  process.stderr.write(`skipped on-call pools integration: ${testDatabase.reason}\n`)
}

const { groups, oncallPools, oncallShifts, roles, userRoles, users } = schema

type PoolRow = {
  id: string
  name: string
  groupId: string | null
  active: boolean
  shiftCount: number
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call pools API — list, create, update and delete (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let oncallId = ''
    let reporterId = ''
    const cookies: Record<'admin' | 'oncall' | 'reporter', string> = {
      admin: '',
      oncall: '',
      reporter: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-pool-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getPools(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/oncall/pools',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function postPool(cookie: string, payload: Record<string, unknown>) {
      return app.inject({ method: 'POST', url: '/api/v1/oncall/pools', headers: { cookie }, payload })
    }

    function patchPool(cookie: string, id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/oncall/pools/${id}`,
        headers: { cookie },
        payload,
      })
    }

    function deletePool(cookie: string, id: string) {
      return app.inject({ method: 'DELETE', url: `/api/v1/oncall/pools/${id}`, headers: { cookie } })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-pools@example.org')
      oncallId = await userIdFor('oncall-pools@example.org')
      reporterId = await userIdFor('reporter-pools@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: oncallId, roleId: await roleIdFor('oncall') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['oncall'] = await sessionCookieFor(oncallId)
      cookies['reporter'] = await sessionCookieFor(reporterId)

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
      const response = await getPools()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('refuses the pool list and create for a role without oncall.read', async () => {
      const list = await getPools(cookies['reporter'])
      const create = await postPool(cookies['reporter'], { name: 'Feuerwehr' })

      expect(list.statusCode).toBe(403)
      expect(list.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(create.statusCode).toBe(403)
    })

    it('allows oncall.read to list pools', async () => {
      const response = await getPools(cookies['oncall'])

      expect(response.statusCode).toBe(200)
      expect(response.json<{ pools: PoolRow[] }>().pools).toEqual([])
    })

    it('lists an empty pool table for an admin', async () => {
      const response = await getPools(cookies['admin'])
      const body = response.json<{ pools: PoolRow[] }>()

      expect(response.statusCode).toBe(200)
      expect(body.pools).toEqual([])
    })

    it('creates a pool with a trimmed name and an optional group', async () => {
      const group = onlyRow(
        await db.insert(groups).values({ name: 'Feuerwehr' }).returning({ id: groups.id }),
        'group',
      )

      const response = await postPool(cookies['admin'], {
        name: '  Feuerwehr  ',
        groupId: group.id,
      })
      const body = response.json<PoolRow>()

      expect(response.statusCode).toBe(201)
      expect(body.name).toBe('Feuerwehr')
      expect(body.groupId).toBe(group.id)
      expect(body.active).toBe(true)
    })

    it('creates a pool without a group when groupId is omitted', async () => {
      const response = await postPool(cookies['admin'], { name: 'Lichtruf' })
      const body = response.json<PoolRow>()

      expect(response.statusCode).toBe(201)
      expect(body.groupId).toBeNull()
      expect(body.active).toBe(true)
    })

    it('rejects a name taken case-insensitively with 409', async () => {
      const duplicate = await postPool(cookies['admin'], { name: 'FEUERWEHR' })

      expect(duplicate.statusCode).toBe(409)
      expect(duplicate.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_pool_name_taken',
        params: { fields: ['name'] },
      })
    })

    it('rejects an empty name and an invalid group id', async () => {
      const empty = await postPool(cookies['admin'], { name: '   ' })
      const badGroup = await postPool(cookies['admin'], { name: 'RWA', groupId: 'not-a-uuid' })

      expect(empty.statusCode).toBe(400)
      expect(empty.json<ErrorResponseBody>().code).toBe('invalid_request')
      expect(badGroup.statusCode).toBe(400)
      expect(badGroup.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('lists created pools with their shift count', async () => {
      const response = await getPools(cookies['admin'])
      const body = response.json<{ pools: PoolRow[] }>()

      expect(response.statusCode).toBe(200)
      expect(body.pools).toHaveLength(2)
      expect(body.pools.map((pool) => pool.name).sort()).toEqual([
        'Feuerwehr',
        'Lichtruf',
      ])
      expect(body.pools.every((pool) => typeof pool.shiftCount === 'number')).toBe(
        true,
      )
    })

    it('renames and deactivates a pool', async () => {
      const pool = onlyRow(
        await db
          .select({ id: oncallPools.id, name: oncallPools.name })
          .from(oncallPools)
          .where(eq(oncallPools.name, 'Lichtruf'))
          .limit(1),
        'pool',
      )

      const response = await patchPool(cookies['admin'], pool.id, {
        name: 'RWA',
        active: false,
      })
      const body = response.json<PoolRow>()

      expect(response.statusCode).toBe(200)
      expect(body.name).toBe('RWA')
      expect(body.active).toBe(false)
    })

    it('rejects a rename to an existing name with 409', async () => {
      const feuerwehr = onlyRow(
        await db
          .select({ id: oncallPools.id })
          .from(oncallPools)
          .where(eq(oncallPools.name, 'Feuerwehr'))
          .limit(1),
        'pool',
      )

      const response = await patchPool(cookies['admin'], feuerwehr.id, { name: 'RWA' })

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_pool_name_taken',
        params: { fields: ['name'] },
      })
    })

    it('returns 404 for an unknown pool on patch and delete', async () => {
      const patch = await patchPool(cookies['admin'], '00000000-0000-0000-0000-000000000000', {
        name: 'Ghost',
      })
      const deleted = await deletePool(cookies['admin'], '00000000-0000-0000-0000-000000000000')

      expect(patch.statusCode).toBe(404)
      expect(patch.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_pool_not_found',
        params: { fields: ['id'] },
      })
      expect(deleted.statusCode).toBe(404)
      expect(deleted.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_pool_not_found',
        params: { fields: ['id'] },
      })
    })

    it('refuses to delete a pool that still has shifts', async () => {
      const pool = onlyRow(
        await db
          .select({ id: oncallPools.id, name: oncallPools.name })
          .from(oncallPools)
          .where(eq(oncallPools.name, 'RWA'))
          .limit(1),
        'pool',
      )

      await db.insert(oncallShifts).values({
        poolId: pool.id,
        startsAt: new Date('2026-01-01T06:00:00Z'),
        endsAt: new Date('2026-01-08T06:00:00Z'),
      })

      const deleted = await deletePool(cookies['admin'], pool.id)

      expect(deleted.statusCode).toBe(409)
      expect(deleted.json<ErrorResponseBody>()).toEqual({
        code: 'oncall_pool_in_use',
        params: { fields: ['id'], shiftCount: 1 },
      })
    })

    it('deletes a pool without shifts', async () => {
      const pool = onlyRow(
        await db
          .select({ id: oncallPools.id, name: oncallPools.name })
          .from(oncallPools)
          .where(eq(oncallPools.name, 'Feuerwehr'))
          .limit(1),
        'pool',
      )

      const deleted = await deletePool(cookies['admin'], pool.id)

      expect(deleted.statusCode).toBe(204)

      const remaining = await db.select({ id: oncallPools.id }).from(oncallPools)

      expect(remaining.map((row) => row.id)).not.toContain(pool.id)
    })
  },
)
