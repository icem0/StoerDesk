import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiKey } from '../../auth/api-keys'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped external object integration: ${testDatabase.reason}\n`)
}

const { objects } = schema

type ObjectBody = { objectNo: string; name: string; active: boolean; notes: string | null }
type ObjectListBody = { objects: ObjectBody[] }
type BulkBody = { results: Array<{ objectNo: string; action: string; error: { code: string } | null }> }
type ErrorBody = { code?: string }

describe.skipIf(testDatabase.status === 'unavailable')(
  'external object API — updated-since, upsert, bulk and soft delete (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let authorization: string

    function call(
      method: 'GET' | 'PUT' | 'POST' | 'DELETE',
      path: string,
      payload?: unknown,
    ) {
      return app.inject({
        method,
        url: path,
        headers: { authorization },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const key = await createApiKey(
        db,
        { name: 'external-objects', scopes: ['objects:read', 'objects:write'] },
        undefined,
      )
      authorization = `Bearer ${key.token}`

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

    it('creates by PUT, replaces by PUT and reads the changed object', async () => {
      const created = await call('PUT', '/api/v1/objects/EXT-001', {
        name: 'Pump house',
        notes: 'first',
      })

      expect(created.statusCode).toBe(201)
      expect(created.json<ObjectBody>()).toMatchObject({ objectNo: 'EXT-001', name: 'Pump house' })

      const updated = await call('PUT', '/api/v1/objects/ext-001', { name: 'Pump house 2' })

      expect(updated.statusCode).toBe(200)
      expect(updated.json<ObjectBody>()).toMatchObject({ objectNo: 'EXT-001', name: 'Pump house 2' })
      expect(updated.json<ObjectBody>().notes).toBeNull()

      const list = await call('GET', '/api/v1/objects?updated_since=2020-01-01T00:00:00.000Z')

      expect(list.statusCode).toBe(200)
      expect(list.json<ObjectListBody>().objects.some((row) => row.objectNo === 'EXT-001')).toBe(true)
    })

    it('answers 400 for an invalid updated_since', async () => {
      const response = await call('GET', '/api/v1/objects?updated_since=yesterday')

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorBody>().code).toBe('invalid_request')
    })

    it('reports bulk item errors without rolling back the valid item', async () => {
      const response = await call('POST', '/api/v1/objects/bulk', {
        items: [
          { objectNo: 'EXT-BULK-1', name: 'Bulk one' },
          { objectNo: 'not valid!', name: '' },
        ],
      })

      expect(response.statusCode).toBe(200)

      const results = response.json<BulkBody>().results

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({ objectNo: 'EXT-BULK-1', action: 'created', error: null })
      expect(results[1]?.action).toBe('error')
      expect(results[1]?.error?.code).toBe('invalid_request')

      const rows = await db.select().from(objects)
      expect(rows.some((row) => row.objectNo === 'EXT-BULK-1')).toBe(true)
    })

    it('soft deletes with the objects:write scope and is idempotent', async () => {
      const first = await call('DELETE', '/api/v1/objects/EXT-001')

      expect(first.statusCode).toBe(204)

      const [row] = await db
        .select({ active: objects.active })
        .from(objects)
        .where(eq(objects.objectNo, 'EXT-001'))

      expect(row?.active).toBe(false)
      expect((await call('DELETE', '/api/v1/objects/EXT-001')).statusCode).toBe(204)
    })
  },
)
