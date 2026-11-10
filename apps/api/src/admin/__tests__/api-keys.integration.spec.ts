import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { verifyApiKey } from '../../auth/api-keys'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped admin api keys integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type ApiKeySummary = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  revokedAt: string | null
}

type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'admin api keys — token shown once, scopes and revocation (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

    async function userIdFor(email: string): Promise<string> {
      return onlyRow(
        await db.insert(users).values({ email, passwordHash: 'no-login' }).returning({ id: users.id }),
        email,
      ).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', cookie: string, payload?: unknown) {
      return app.inject({
        method,
        url: '/api/v1/api-keys',
        headers: { cookie },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-api-keys@example.org')
      const officeId = await userIdFor('office-api-keys@example.org')

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

    it('refuses the list to a role without apikey.read', async () => {
      const response = await request('GET', cookies['office'])

      expect(response.statusCode).toBe(403)
      expect(response.json<ErrorBody>().code).toBe('forbidden')
    })

    it('creates a key, shows the token once and never lists it', async () => {
      const created = await request('POST', cookies['admin'], {
        name: 'Hausmeisterei',
        scopes: ['objects:read', 'tickets:read'],
      })
      const body = created.json<{ key: ApiKeySummary; token: string }>()

      expect(created.statusCode).toBe(201)
      expect(body.token).toMatch(/^sk_[A-Za-z0-9_-]{43}$/)
      expect(body.key).toMatchObject({
        name: 'Hausmeisterei',
        scopes: ['objects:read', 'tickets:read'],
        revokedAt: null,
      })

      const list = await request('GET', cookies['admin'])
      const listed = list.json<{ keys: ApiKeySummary[] }>().keys

      expect(list.statusCode).toBe(200)
      expect(JSON.stringify(listed)).not.toContain(body.token)
      expect(listed[0]).not.toHaveProperty('token')
      expect(listed[0]).not.toHaveProperty('tokenHash')

      expect(await verifyApiKey(db, body.token)).toEqual({
        id: body.key.id,
        scopes: ['objects:read', 'tickets:read'],
      })
    })

    it('rejects an empty scope set and an unknown scope', async () => {
      const empty = await request('POST', cookies['admin'], { name: 'x', scopes: [] })
      const unknown = await request('POST', cookies['admin'], {
        name: 'x',
        scopes: ['objects:read', 'admin:everything'],
      })

      expect(empty.statusCode).toBe(400)
      expect(unknown.statusCode).toBe(400)
    })

    it('revokes a key and stops verifying it', async () => {
      const created = await request('POST', cookies['admin'], {
        name: 'temporary',
        scopes: ['tickets:write'],
      })
      const body = created.json<{ key: ApiKeySummary; token: string }>()

      const revoked = await app.inject({
        method: 'DELETE',
        url: `/api/v1/api-keys/${body.key.id}`,
        headers: { cookie: cookies['admin'] },
      })

      expect(revoked.statusCode).toBe(204)
      expect(await verifyApiKey(db, body.token)).toBeUndefined()
    })
  },
)
