import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'
import { hashPassword } from '../../auth/password'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket delete routes: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, ticketPurges, tickets, users, userRoles, roles } = schema

describe.skipIf(testDatabase.status === 'unavailable')('ticket delete routes (http integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let sessionCookie = ''
  let ticketNo = ''
  let ticketId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const [user] = await db
      .insert(users)
      .values({
        email: `delete-admin-${Date.now()}@example.de`,
        passwordHash: await hashPassword('a-login-password-1234'),
      })
      .returning({ id: users.id })

    if (!user) throw new Error('expected the seeded admin user')

    const [adminRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'admin'))

    if (!adminRole) throw new Error('expected the seeded admin role')

    await db.insert(userRoles).values({ userId: user.id, roleId: adminRole.id })

    const [object] = await db
      .insert(objects)
      .values({ objectNo: '7201_01', name: 'Rathaus', city: 'Musterstadt' })
      .returning({ id: objects.id })

    if (!object) throw new Error('expected to insert the probe object')

    const [ticket] = await db
      .insert(tickets)
      .values({
        objectId: object.id,
        ticketNo: `ST-2026-DELETE-${Date.now().toString(36)}`,
        status: 'CANCELLED',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date('2026-11-05T08:00:00.000Z'),
        receivedAt: new Date('2026-11-05T08:00:00.000Z'),
        deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
      })
      .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

    if (!ticket) throw new Error('expected to insert the cancelled ticket')

    ticketId = ticket.id
    ticketNo = ticket.ticketNo

    await db.insert(ticketEvents).values({
      ticketId,
      type: 'created',
      actorKind: 'system',
      actorUserId: null,
      payload: { source: 'INTERNAL' },
      createdAt: new Date('2026-11-05T08:00:00.000Z'),
    })

    // Create a session directly, like requirePermission tests do
    const session = await createSession(db, user.id, 1)
    sessionCookie = `session=${session.token}`

    process.env.DATABASE_URL = url
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

  it('deletes a cancelled ticket via HTTP DELETE', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tickets/${ticketNo}`,
      headers: { cookie: sessionCookie },
    })

    console.log('DELETE response status:', response.statusCode)
    console.log('DELETE response body:', response.body)

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.ticketNo).toBe(ticketNo)

    const remaining = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
    expect(remaining).toHaveLength(0)

    const purges = await db
      .select()
      .from(ticketPurges)
      .where(eq(ticketPurges.ticketNo, ticketNo))
    expect(purges).toHaveLength(1)
  })

  it('returns 409 for a non-cancelled ticket', async () => {
    const [objectRow] = await db.select({ id: objects.id }).from(objects).limit(1)

    if (!objectRow) throw new Error('expected an object to exist')

    const [openTicket] = await db
      .insert(tickets)
      .values({
        objectId: objectRow.id,
        ticketNo: `ST-2026-OPEN-${Date.now().toString(36)}`,
        status: 'NEW',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: new Date('2026-11-05T08:00:00.000Z'),
        receivedAt: new Date('2026-11-05T08:00:00.000Z'),
        deadlineAt: new Date('2026-11-08T08:00:00.000Z'),
      })
      .returning({ ticketNo: tickets.ticketNo })

    if (!openTicket) throw new Error('expected to insert the open ticket')

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tickets/${openTicket.ticketNo}`,
      headers: { cookie: sessionCookie },
    })

    expect(response.statusCode).toBe(409)
    const body = JSON.parse(response.body)
    expect(body.code).toBe('ticket_not_cancelled')
  })

  it('returns 404 for a missing ticket', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tickets/ST-9999-9999',
      headers: { cookie: sessionCookie },
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.code).toBe('ticket_not_found')
  })
})
