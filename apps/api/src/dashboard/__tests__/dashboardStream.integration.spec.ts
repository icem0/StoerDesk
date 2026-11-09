import { eq } from 'drizzle-orm'
import http from 'node:http'
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
  process.stderr.write(`skipped dashboard SSE stream: ${testDatabase.reason}\n`)
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

function parseSseBlocks(buffer: string): {
  events: Array<{ event: string; data: string }>
  rest: string
} {
  const events: Array<{ event: string; data: string }> = []
  const blocks = buffer.split('\n\n')
  const rest = blocks.pop() ?? ''

  for (const block of blocks) {
    let event = ''
    let data = ''

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice(7)
      } else if (line.startsWith('data: ')) {
        data = line.slice(6)
      }
    }

    if (event !== '' || data !== '') {
      events.push({ event, data })
    }
  }

  return { events, rest }
}

describe.skipIf(testDatabase.status === 'unavailable')('dashboard SSE stream (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let baseUrl = ''
  let adminCookie = ''
  let spectatorCookie = ''
  let objectId = ''

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

  async function openStream(cookie: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/v1/dashboard/stream`, {
        headers: { Cookie: cookie },
        // Disable keep-alive pooling so each test gets a fresh socket; a socket
        // destroyed by a previous test must not be handed out again.
        agent: false,
      })

      req.on('response', (res) => resolve(res))
      req.on('error', reject)
    })
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const [adminRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin'))

    if (adminRole === undefined) {
      throw new Error('expected the seeded admin role')
    }

    const createUser = async (email: string, password: string, roleKey: string | null) => {
      const userId = onlyRow(
        await db
          .insert(users)
          .values({ email, passwordHash: await hashPassword(password), active: true })
          .returning({ id: users.id }),
        'user',
      ).id

      if (roleKey !== null) {
        const role = onlyRow(
          await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)),
          `the ${roleKey} role`,
        )

        await db.insert(userRoles).values({ userId, roleId: role.id })
      }
    }

    await createUser('stream-admin@example.de', 'a-login-password-1234', 'admin')
    // A signed-in user without any role holds no permissions, so `ticket.read`
    // is rejected before the stream opens.
    await createUser('stream-spectator@example.de', 'a-login-password-1234', null)

    const object = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `SSE_${Date.now().toString(36)}`, name: 'Wache Ost' })
        .returning({ id: objects.id }),
      'the inserted object',
    )

    objectId = object.id

    const poolId = onlyRow(
      await db
        .insert(oncallPools)
        .values({ name: 'Beta Bereitschaft' })
        .returning({ id: oncallPools.id }),
      'the inserted pool',
    ).id

    const technicianId = onlyRow(
      await db
        .insert(users)
        .values({
          email: `sse-tech-${Date.now().toString(36)}@example.org`,
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
          ticketNo: 'ST-2026-0101',
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

    // Short intervals drive the stream probe and heartbeat in the tests.
    process.env.DASHBOARD_PROBE_INTERVAL_MS = '50'
    process.env.DASHBOARD_HEARTBEAT_INTERVAL_MS = '100'
    process.env.DATABASE_URL = url
    process.env.API_LOG_LEVEL = 'silent'

    app = await buildServer()

    adminCookie = await login('stream-admin@example.de', 'a-login-password-1234')
    spectatorCookie = await login('stream-spectator@example.de', 'a-login-password-1234')

    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()

    if (typeof address !== 'string' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`
    } else {
      throw new Error('expected the dashboard server to listen on a TCP port')
    }
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('sends a dashboard snapshot immediately on connect', async () => {
    const res = await openStream(adminCookie)
    let buffer = ''
    let seenDashboard = false

    for await (const chunk of res) {
      buffer += chunk.toString()
      const { events, rest } = parseSseBlocks(buffer)
      buffer = rest

      for (const e of events) {
        if (e.event === 'dashboard') {
          const snapshot = JSON.parse(e.data)

          expect(snapshot.generatedAt).toBeDefined()
          expect(snapshot.tiles.open).toBeGreaterThanOrEqual(1)
          expect(snapshot.tiles.onCall).not.toBeNull()
          expect(snapshot.tiles.channels).not.toBeNull()
          seenDashboard = true
          break
        }
      }

      if (seenDashboard) {
        break
      }
    }

    res.destroy()
    expect(seenDashboard).toBe(true)
  })

  it('sends a new snapshot when a ticket is inserted', async () => {
    const res = await openStream(adminCookie)
    let buffer = ''
    let dashboardCount = 0
    let inserted = false
    let done = false

    for await (const chunk of res) {
      if (done) {
        break
      }

      buffer += chunk.toString()
      const { events, rest } = parseSseBlocks(buffer)
      buffer = rest

      for (const e of events) {
        if (e.event !== 'dashboard') {
          continue
        }

        dashboardCount++

        if (dashboardCount === 1 && !inserted) {
          await db.insert(tickets).values({
            objectId,
            ticketNo: `ST-2026-${Date.now().toString().slice(-6)}`,
            status: 'NEW',
            priority: 'normal',
            source: 'QR',
            reportedAt: now,
            receivedAt: now,
            deadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
            isTest: false,
            suspectedSpam: false,
          })
          inserted = true
        }

        if (dashboardCount === 2) {
          done = true
          break
        }
      }
    }

    res.destroy()
    expect(dashboardCount).toBe(2)
  })

  it('sends only heartbeats while nothing changes', async () => {
    const res = await openStream(adminCookie)
    let buffer = ''
    let dashboardCount = 0
    let heartbeatCount = 0
    let windowStarted = false
    let windowStart = 0

    for await (const chunk of res) {
      buffer += chunk.toString()
      const { events, rest } = parseSseBlocks(buffer)
      buffer = rest

      for (const e of events) {
        if (e.event === 'dashboard') {
          dashboardCount++

          if (dashboardCount === 1) {
            windowStarted = true
            windowStart = Date.now()
          }
        } else if (e.event === 'heartbeat' && windowStarted) {
          heartbeatCount++
        }
      }

      if (windowStarted && Date.now() - windowStart > 1000) {
        break
      }
    }

    res.destroy()
    expect(dashboardCount).toBe(1)
    expect(heartbeatCount).toBeGreaterThan(0)
  })

  it('rejects a user without ticket.read before the stream opens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stream',
      headers: { cookie: spectatorCookie },
    })

    expect(response.statusCode).toBe(403)
  })
})
