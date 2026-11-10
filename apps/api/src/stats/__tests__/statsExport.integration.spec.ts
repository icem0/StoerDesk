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
  process.stderr.write(`skipped statistics CSV export: ${testDatabase.reason}\n`)
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

describe.skipIf(testDatabase.status === 'unavailable')('statistics CSV export (integration)', () => {
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

    await createUser('export-manager@example.de', 'a-login-password-1234', 'manager')
    await createUser('export-internal@example.de', 'a-login-password-1234', 'reporter_internal')

    const objectId = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `EXPORT_${Date.now().toString(36)}`, name: 'Feuer;Wache' })
        .returning({ id: objects.id }),
      'the inserted object',
    ).id

    await db.insert(tickets).values({
      objectId,
      ticketNo: `ST-EXP-${Date.now().toString(36)}`,
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

    managerCookie = await login('export-manager@example.de', 'a-login-password-1234')
    internalCookie = await login('export-internal@example.de', 'a-login-password-1234')
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('downloads the CSV with the fixed header, all sections and a quoted object name', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/export.csv?from=2026-01-01&to=2026-12-31',
      headers: { cookie: managerCookie },
    })

    expect(response.statusCode).toBe(200)
    expect(String(response.headers['content-type'])).toContain('text/csv')
    expect(String(response.headers['content-disposition'])).toContain(
      'filename="stoerdesk-statistik-2026-01-01-2026-12-31.csv"',
    )

    const body = response.body
    expect(body.startsWith('section;metric;bucket;key;value\n')).toBe(true)
    expect(body).toContain('reactionTimes;')
    expect(body).toContain('frequency;')
    expect(body).toContain('objects;')
    expect(body).toContain('compliance;')
    expect(body).toContain('declines;')
    expect(body).toContain('"Feuer;Wache"')
  })

  it('rejects a user without stats.export', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/export.csv',
      headers: { cookie: internalCookie },
    })

    expect(response.statusCode).toBe(403)
  })
})
