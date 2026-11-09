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
  process.stderr.write(`skipped dashboard routes: ${testDatabase.reason}\n`)
}

const { objects, oncallPools, oncallShifts, outbox, roles, tickets, userRoles, users } = schema

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

type DashboardBody = {
  tiles: {
    open: number
    onCall: { kind: string } | null
    channels: { name: string }[] | null
  }
  faultFree: { since: string | null }
}

describe.skipIf(testDatabase.status === 'unavailable')('dashboard routes (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let adminCookie = ''
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

    const [adminRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'admin'))

    if (adminRole === undefined) {
      throw new Error('expected the seeded admin role')
    }

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

    await createUser('dashboard-admin@example.de', 'a-login-password-1234', 'admin')
    await createUser('dashboard-internal@example.de', 'a-login-password-1234', 'reporter_internal')

    const objectId = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `DASH_${Date.now().toString(36)}`, name: 'Feuerwache Nord' })
        .returning({ id: objects.id }),
      'the inserted object',
    ).id

    const poolId = onlyRow(
      await db.insert(oncallPools).values({ name: 'Alpha Bereitschaft' }).returning({ id: oncallPools.id }),
      'the inserted pool',
    ).id

    const technicianId = onlyRow(
      await db
        .insert(users)
        .values({
          email: `dash-tech-${Date.now().toString(36)}@example.org`,
          givenName: 'Max',
          familyName: 'Muster',
          passwordHash: 'no-login',
          active: true,
        })
        .returning({ id: users.id }),
      'the inserted technician',
    ).id

    await db.insert(oncallShifts).values({
      poolId,
      userId: technicianId,
      state: 'CONFIRMED',
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),
    })

    const ticketId = onlyRow(
      await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: 'ST-2026-0001',
          status: 'NEW',
          priority: 'normal',
          source: 'QR',
          reportedAt: now,
          receivedAt: now,
          deadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
          isTest: false,
          suspectedSpam: false,
        })
        .returning({ id: tickets.id }),
      'ticket',
    ).id

    await db.insert(outbox).values({
      ticketId,
      channel: 'ntfy',
      state: 'SENT',
      createdAt: now,
    })

    // The server reads its database from the environment.
    process.env.DATABASE_URL = url
    process.env.API_LOG_LEVEL = 'silent'

    app = await buildServer()

    adminCookie = await login('dashboard-admin@example.de', 'a-login-password-1234')
    internalCookie = await login('dashboard-internal@example.de', 'a-login-password-1234')
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('answers 401 without a session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
    })

    expect(response.statusCode).toBe(401)
  })

  it('ticket.read sees the ticket tiles with on-call and channel sections', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: { cookie: adminCookie },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<DashboardBody>()

    expect(body.tiles.open).toBeGreaterThanOrEqual(1)
    expect(body.tiles.onCall).not.toBeNull()
    expect(body.tiles.channels).not.toBeNull()
    expect(body.faultFree.since).toBe(now.toISOString())
  })

  it('a user without oncall.read gets onCall: null', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: { cookie: internalCookie },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<DashboardBody>()

    expect(body.tiles.onCall).toBeNull()
    expect(body.tiles.channels).not.toBeNull()
  })
})
