import { eq } from 'drizzle-orm'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { hashPassword } from '../../auth/password'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped statistics routes: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, userRoles, users } = schema

type WithCookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

function setCookieHeaders(response: WithCookieHeaders): string[] {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry))
  }

  return typeof raw === 'string' ? [raw] : []
}

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
    throw new Error(`expected ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('statistics routes (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let managerCookie = ''
  let internalCookie = ''

  const now = new Date()

  async function login(email: string, password: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    })

    const pair = cookiePair(response, 'session')

    if (pair === undefined) {
      throw new Error(`login did not set a session cookie for ${email}`)
    }

    return pair
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const createUser = async (email: string, password: string, roleKey: string) => {
      const userId = onlyRow(
        await db
          .insert(users)
          .values({ email, passwordHash: await hashPassword(password), active: true })
          .returning({ id: users.id }),
        'user',
      ).id

      const role = onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)),
        `the ${roleKey} role`,
      )

      await db.insert(userRoles).values({ userId, roleId: role.id })
    }

    await createUser('stats-manager@example.de', 'a-login-password-1234', 'manager')
    await createUser('stats-internal@example.de', 'a-login-password-1234', 'reporter_internal')

    const objectId = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `STATROUTE_${Date.now().toString(36)}`, name: 'Statistik Objekt' })
        .returning({ id: objects.id }),
      'the inserted object',
    ).id

    await db.insert(tickets).values({
      objectId,
      ticketNo: `ST-STAT-${Date.now().toString(36)}`,
      status: 'ACKNOWLEDGED',
      priority: 'normal',
      source: 'QR',
      reportedAt: now,
      receivedAt: now,
      deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
      acknowledgedAt: new Date(now.getTime() + 30 * 60 * 1000),
    })

    process.env.DATABASE_URL = url
    process.env.API_LOG_LEVEL = 'silent'

    app = await buildServer()

    managerCookie = await login('stats-manager@example.de', 'a-login-password-1234')
    internalCookie = await login('stats-internal@example.de', 'a-login-password-1234')
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('answers the four sections for a manager', async () => {
    const reaction = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/reaction-times',
      headers: { cookie: managerCookie },
    })
    expect(reaction.statusCode).toBe(200)
    expect(reaction.json<{ acknowledge: { count: number } }>().acknowledge.count).toBeGreaterThanOrEqual(1)

    const frequency = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/frequency?bucket=day',
      headers: { cookie: managerCookie },
    })
    expect(frequency.statusCode).toBe(200)
    expect(Array.isArray(frequency.json<{ series: unknown[] }>().series)).toBe(true)

    const objects = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/objects',
      headers: { cookie: managerCookie },
    })
    expect(objects.statusCode).toBe(200)
    expect(Array.isArray(objects.json<{ topObjects: unknown[] }>().topObjects)).toBe(true)

    const compliance = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/compliance',
      headers: { cookie: managerCookie },
    })
    expect(compliance.statusCode).toBe(200)
    expect(compliance.json<{ onTimeRate: number | null }>().onTimeRate).toBe(1)
  })

  it('rejects a user without stats.read', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/reaction-times',
      headers: { cookie: internalCookie },
    })

    expect(response.statusCode).toBe(403)
  })

  it('answers stats_range_invalid for an impossible range', async () => {
    const reversed = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/reaction-times?from=2026-03-11&to=2026-03-10',
      headers: { cookie: managerCookie },
    })
    expect(reversed.statusCode).toBe(422)
    expect(reversed.json<{ code: string }>().code).toBe('stats_range_invalid')

    const tooLong = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/reaction-times?from=2020-01-01&to=2026-01-01',
      headers: { cookie: managerCookie },
    })
    expect(tooLong.statusCode).toBe(422)
    expect(tooLong.json<{ code: string }>().code).toBe('stats_range_invalid')
  })

  it('answers invalid_request with field errors for a malformed filter', async () => {
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/reaction-times?priority=urgent',
      headers: { cookie: managerCookie },
    })
    expect(malformed.statusCode).toBe(422)
    expect(malformed.json<{ code: string; params: { fields: string[] } }>().code).toBe('invalid_request')

    const missingBucket = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/frequency',
      headers: { cookie: managerCookie },
    })
    expect(missingBucket.statusCode).toBe(422)
    expect(missingBucket.json<{ params: { fields: string[] } }>().params.fields).toContain('bucket')
  })
})
