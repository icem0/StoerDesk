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
import { webhookRoutes } from '../endpoints'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped webhook endpoints integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type WebhookSummary = {
  id: string
  url: string
  events: string[]
  active: boolean
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
  'webhook endpoints — validation, secret once and settings guard (integration)',
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

    function request(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      cookie: string,
      payload?: unknown,
      path = '/api/v1/webhooks',
    ) {
      return app.inject({
        method,
        url: path,
        headers: { cookie },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-webhooks@example.org')
      const officeId = await userIdFor('office-webhooks@example.org')

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
      await app.register(webhookRoutes, { database: db })
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('lets a reader list but not create', async () => {
      const list = await request('GET', cookies['office'])
      const create = await request('POST', cookies['office'], {
        url: 'https://example.org/hook',
        events: ['ticket.created'],
      })

      expect(list.statusCode).toBe(200)
      expect(list.json<{ webhooks: WebhookSummary[] }>().webhooks).toEqual([])
      expect(create.statusCode).toBe(403)
      expect(create.json<ErrorBody>().code).toBe('forbidden')
    })

    it('rejects an invalid URL, an empty event set and an unknown event', async () => {
      const badUrl = await request('POST', cookies['admin'], {
        url: 'ftp://example.org/hook',
        events: ['ticket.created'],
      })
      const empty = await request('POST', cookies['admin'], {
        url: 'https://example.org/hook',
        events: [],
      })
      const unknown = await request('POST', cookies['admin'], {
        url: 'https://example.org/hook',
        events: ['ticket.created', 'ticket.deleted'],
      })

      expect(badUrl.statusCode).toBe(400)
      expect(empty.statusCode).toBe(400)
      expect(unknown.statusCode).toBe(400)
      expect(unknown.json<ErrorBody>().code).toBe('invalid_request')
    })

    it('shows the secret once and never lists it', async () => {
      const created = await request('POST', cookies['admin'], {
        url: 'https://example.org/hook',
        events: ['ticket.created', 'ticket.status_changed'],
      })
      const body = created.json<{ webhook: WebhookSummary; secret: string }>()

      expect(created.statusCode).toBe(201)
      expect(body.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
      expect(body.webhook).toMatchObject({
        url: 'https://example.org/hook',
        events: ['ticket.created', 'ticket.status_changed'],
        active: true,
      })

      const list = await request('GET', cookies['admin'])
      const listed = list.json<{ webhooks: WebhookSummary[] }>().webhooks

      expect(list.statusCode).toBe(200)
      expect(JSON.stringify(listed)).not.toContain(body.secret)
      expect(listed[0]).not.toHaveProperty('secret')
    })

    it('updates the active switch and deletes without leaking the route', async () => {
      const created = await request('POST', cookies['admin'], {
        url: 'https://example.org/old',
        events: ['ticket.created'],
      })
      const id = created.json<{ webhook: WebhookSummary }>().webhook.id

      const updated = await request('PATCH', cookies['admin'], { active: false }, `/api/v1/webhooks/${id}`)

      expect(updated.statusCode).toBe(200)
      expect(updated.json<WebhookSummary>().active).toBe(false)

      const removed = await request('DELETE', cookies['admin'], undefined, `/api/v1/webhooks/${id}`)
      const again = await request('DELETE', cookies['admin'], undefined, `/api/v1/webhooks/${id}`)

      expect(removed.statusCode).toBe(204)
      expect(again.statusCode).toBe(404)
      expect(again.json<ErrorBody>().code).toBe('webhook_not_found')
    })
  },
)
