import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { objects, oncallPools, oncallShifts, ticketEvents, tickets } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call ticket coupling: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type ShiftRow = {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: string
  endsAt: string
}

type WarningBody = {
  defaultPoolId: string | null
  unstaffed: ShiftRow[]
  unconfirmed: ShiftRow[]
}

type OfferBody = {
  status: string
  offeredToUserId: string | null
  offerEscalatedAt: string | null
  warning?: string
}

type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call ticket coupling (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let technicianId = ''
    let confirmedPoolId = ''
    let plannedPoolId = ''
    let emptyPoolId = ''
    let objectId = ''
    let adminCookie = ''

    const hour = 60 * 60 * 1000
    const day = 24 * hour
    let sequence = 0

    async function insertShift(
      pool: string,
      state: string,
      startsAt: Date,
      endsAt: Date,
      userId: string | null,
    ): Promise<string> {
      const [row] = await db
        .insert(oncallShifts)
        .values({ poolId: pool, userId, state, startsAt, endsAt })
        .returning({ id: oncallShifts.id })

      return onlyRow(row ? [row] : [], 'the inserted shift').id
    }

    async function insertTicket(status: string): Promise<{ id: string; ticketNo: string }> {
      sequence += 1
      const [row] = await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: `ST-2026-COUPLING-${Date.now().toString(36)}-${sequence}`,
          status,
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: new Date(),
          receivedAt: new Date(),
          deadlineAt: new Date(Date.now() + day),
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      return onlyRow(row ? [row] : [], 'the inserted ticket')
    }

    function offer(ticketNo: string, payload: Record<string, unknown> = {}) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/tickets/${ticketNo}/offer`,
        headers: { cookie: adminCookie },
        payload,
      })
    }

    function getWarnings() {
      return app.inject({
        method: 'GET',
        url: '/api/v1/oncall/warnings',
        headers: { cookie: adminCookie },
      })
    }

    async function offeredEvent(ticketId: string) {
      return onlyRow(
        await db
          .select({ payload: ticketEvents.payload })
          .from(ticketEvents)
          .where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.type, 'offered'))),
        'the offered event',
      ).payload as Record<string, unknown>
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [admin] = await db
        .insert(users)
        .values({ email: `coupling-admin-${Date.now()}@example.org`, passwordHash: 'no-login' })
        .returning({ id: users.id })
      adminId = onlyRow(admin ? [admin] : [], 'the admin user').id

      const [technician] = await db
        .insert(users)
        .values({ email: `coupling-tech-${Date.now()}@example.org`, passwordHash: 'no-login' })
        .returning({ id: users.id })
      technicianId = onlyRow(technician ? [technician] : [], 'the technician user').id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))
      await db.insert(userRoles).values({
        userId: adminId,
        roleId: onlyRow(adminRole ? [adminRole] : [], 'the admin role').id,
      })

      const [confirmedPool] = await db
        .insert(oncallPools)
        .values({ name: 'Alpha Bereitschaft', groupId: null })
        .returning({ id: oncallPools.id })
      confirmedPoolId = onlyRow(confirmedPool ? [confirmedPool] : [], 'the confirmed pool').id

      const [plannedPool] = await db
        .insert(oncallPools)
        .values({ name: 'Beta Bereitschaft', groupId: null })
        .returning({ id: oncallPools.id })
      plannedPoolId = onlyRow(plannedPool ? [plannedPool] : [], 'the planned pool').id

      const [emptyPool] = await db
        .insert(oncallPools)
        .values({ name: 'Gamma Bereitschaft', groupId: null })
        .returning({ id: oncallPools.id })
      emptyPoolId = onlyRow(emptyPool ? [emptyPool] : [], 'the empty pool').id

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `COUPLING_${Date.now().toString(36)}`, name: 'Rathaus' })
        .returning({ id: objects.id })
      objectId = onlyRow(object ? [object] : [], 'the object').id

      const session = await createSession(db, adminId, 1)
      adminCookie = `session=${session.token}`

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

    it('offers to the technician of a covering CONFIRMED shift', async () => {
      const now = Date.now()
      const shiftId = await insertShift(
        confirmedPoolId,
        'CONFIRMED',
        new Date(now - hour),
        new Date(now + hour),
        technicianId,
      )
      const ticket = await insertTicket('WORK_ORDER_CREATED')

      const response = await offer(ticket.ticketNo)

      expect(response.statusCode).toBe(200)
      const body = response.json<OfferBody>()
      expect(body.status).toBe('OFFERED')
      expect(body.offeredToUserId).toBe(technicianId)
      expect(body.warning).toBeUndefined()
      expect(body.offerEscalatedAt).not.toBeNull()

      const [stored] = await db
        .select({ offeredToUserId: tickets.offeredToUserId, offerEscalatedAt: tickets.offerEscalatedAt })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
      expect(stored?.offeredToUserId).toBe(technicianId)

      const payload = await offeredEvent(ticket.id)
      expect(payload).toMatchObject({
        onCall: 'confirmed',
        shiftId,
        poolId: confirmedPoolId,
      })
      expect(payload.warning).toBeUndefined()
    })

    it('offers to the technician of a PLANNED shift with the unconfirmed warning', async () => {
      const now = Date.now()
      const shiftId = await insertShift(
        plannedPoolId,
        'PLANNED',
        new Date(now - hour),
        new Date(now + hour),
        technicianId,
      )
      const ticket = await insertTicket('WORK_ORDER_CREATED')

      const response = await offer(ticket.ticketNo, { poolId: plannedPoolId })

      expect(response.statusCode).toBe(200)
      const body = response.json<OfferBody>()
      expect(body.status).toBe('OFFERED')
      expect(body.offeredToUserId).toBe(technicianId)
      expect(body.warning).toBe('oncall_unconfirmed')

      const payload = await offeredEvent(ticket.id)
      expect(payload).toMatchObject({
        onCall: 'planned',
        shiftId,
        poolId: plannedPoolId,
        warning: 'oncall_unconfirmed',
      })
    })

    it('clears the technician and warns when no shift covers the offer', async () => {
      const ticket = await insertTicket('WORK_ORDER_CREATED')

      const response = await offer(ticket.ticketNo, { poolId: emptyPoolId })

      expect(response.statusCode).toBe(200)
      const body = response.json<OfferBody>()
      expect(body.status).toBe('OFFERED')
      expect(body.offeredToUserId).toBeNull()
      expect(body.offerEscalatedAt).toBeNull()
      expect(body.warning).toBe('oncall_unstaffed')

      const payload = await offeredEvent(ticket.id)
      expect(payload).toMatchObject({
        onCall: 'unstaffed',
        shiftId: null,
        poolId: emptyPoolId,
        warning: 'oncall_unstaffed',
      })
    })

    it('rejects a malformed poolId with 400 invalid_request', async () => {
      const ticket = await insertTicket('WORK_ORDER_CREATED')

      const response = await offer(ticket.ticketNo, { poolId: 'not-a-uuid' })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorBody>().code).toBe('invalid_request')
    })

    it('refuses to offer a ticket outside WORK_ORDER_CREATED', async () => {
      const ticket = await insertTicket('NEW')

      const response = await offer(ticket.ticketNo, { poolId: emptyPoolId })

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorBody>().code).toBe('invalid_transition')
    })

    it('lists unstaffed and unconfirmed slots with the default pool', async () => {
      const now = Date.now()
      const unstaffedId = await insertShift(
        emptyPoolId,
        'UNFILLED',
        new Date(now + hour),
        new Date(now + 2 * hour),
        null,
      )
      const declinedId = await insertShift(
        emptyPoolId,
        'DECLINED',
        new Date(now + 2 * hour),
        new Date(now + 3 * hour),
        technicianId,
      )
      const unconfirmedId = await insertShift(
        emptyPoolId,
        'PLANNED',
        new Date(now + 3 * hour),
        new Date(now + 4 * hour),
        technicianId,
      )
      const confirmedId = await insertShift(
        emptyPoolId,
        'CONFIRMED',
        new Date(now + 4 * hour),
        new Date(now + 5 * hour),
        technicianId,
      )
      const farFutureId = await insertShift(
        emptyPoolId,
        'UNFILLED',
        new Date(now + 30 * day),
        new Date(now + 31 * day),
        null,
      )

      const response = await getWarnings()

      expect(response.statusCode).toBe(200)
      const body = response.json<WarningBody>()
      expect(body.defaultPoolId).toBe(confirmedPoolId)

      const unstaffedIds = body.unstaffed.map((shift) => shift.id)
      expect(unstaffedIds).toContain(unstaffedId)
      expect(unstaffedIds).toContain(declinedId)
      expect(unstaffedIds).not.toContain(farFutureId)
      expect(unstaffedIds).not.toContain(confirmedId)

      const unconfirmedIds = body.unconfirmed.map((shift) => shift.id)
      expect(unconfirmedIds).toContain(unconfirmedId)
      expect(unconfirmedIds).not.toContain(confirmedId)
    })
  },
)
