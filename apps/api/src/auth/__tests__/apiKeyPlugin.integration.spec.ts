import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiKey, revokeApiKey } from '../api-keys'
import { createSession } from '../session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped api key plugin integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type ProbeBody = { allowed?: boolean; code?: string }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'apiKeyPlugin — bearer keys and dual guard (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let objectsToken: string
    let ticketsToken: string
    let revokedToken: string
    let expiredToken: string
    let sessionCookie: string
    let limitedSessionCookie: string

    function probe(path: 'objects' | 'tickets', headers: Record<string, string>) {
      return app.inject({ method: 'GET', url: `/api/v1/_test/api-key/${path}`, headers })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = onlyRow(
        await db
          .insert(users)
          .values({ email: 'api-key-plugin@example.org', passwordHash: 'no-login' })
          .returning({ id: users.id }),
        'admin user',
      ).id
      const plainId = onlyRow(
        await db
          .insert(users)
          .values({ email: 'api-key-plugin-plain@example.org', passwordHash: 'no-login' })
          .returning({ id: users.id }),
        'plain user',
      ).id
      const adminRoleId = onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin')),
        'admin role',
      ).id

      await db.insert(userRoles).values({ userId: adminId, roleId: adminRoleId })

      const adminSession = await createSession(db, adminId, 1)
      const plainSession = await createSession(db, plainId, 1)
      sessionCookie = `session=${adminSession.token}`
      limitedSessionCookie = `session=${plainSession.token}`

      const objects = await createApiKey(db, { name: 'objects', scopes: ['objects:read'] }, adminId)
      const tickets = await createApiKey(db, { name: 'tickets', scopes: ['tickets:read'] }, adminId)
      const revoked = await createApiKey(db, { name: 'revoked', scopes: ['objects:read'] }, adminId)
      const expired = await createApiKey(
        db,
        { name: 'expired', scopes: ['objects:read'], expiresAt: '2020-01-01T00:00:00.000Z' },
        adminId,
      )

      objectsToken = objects.token
      ticketsToken = tickets.token
      revokedToken = revoked.token
      expiredToken = expired.token
      await revokeApiKey(db, revoked.key.id)

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

    it('accepts a key with the matching scope', async () => {
      const response = await probe('objects', { authorization: `Bearer ${objectsToken}` })

      expect(response.statusCode).toBe(200)
      expect(response.json<ProbeBody>().allowed).toBe(true)
    })

    it('answers 403 when the key lacks the required scope', async () => {
      const response = await probe('objects', { authorization: `Bearer ${ticketsToken}` })

      expect(response.statusCode).toBe(403)
      expect(response.json<ProbeBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('rejects revoked and expired keys with api_key_invalid', async () => {
      const revoked = await probe('objects', { authorization: `Bearer ${revokedToken}` })
      const expired = await probe('objects', { authorization: `Bearer ${expiredToken}` })

      expect(revoked.statusCode).toBe(401)
      expect(revoked.json<ProbeBody>().code).toBe('api_key_invalid')
      expect(expired.statusCode).toBe(401)
      expect(expired.json<ProbeBody>().code).toBe('api_key_invalid')
    })

    it('rejects a malformed authorization header', async () => {
      const response = await probe('objects', { authorization: 'Basic abc' })

      expect(response.statusCode).toBe(401)
      expect(response.json<ProbeBody>().code).toBe('api_key_invalid')
    })

    it('keeps the session path with the matching permission', async () => {
      const allowed = await probe('objects', { cookie: sessionCookie })
      const denied = await probe('objects', { cookie: limitedSessionCookie })
      const anonymous = await probe('objects', {})

      expect(allowed.statusCode).toBe(200)
      expect(denied.statusCode).toBe(403)
      expect(anonymous.statusCode).toBe(401)
      expect(anonymous.json<ProbeBody>().code).toBe('session_invalid')
    })

    it('does not fall back to a session when a key lacks the scope', async () => {
      const response = await probe('tickets', {
        authorization: `Bearer ${objectsToken}`,
        cookie: sessionCookie,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<ProbeBody>().code).toBe('forbidden')
    })
  },
)
