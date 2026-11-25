import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationAccounts, oncallPools, oncallShifts, outbox } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call release notifications integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

type ShiftRow = {
  id: string
  poolId: string
  userId: string | null
  state: string
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the release of a shift notifies the technician (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let techId = ''
    let otherId = ''
    let poolId = ''
    const cookies: Record<'admin' | 'tech' | 'other', string> = {
      admin: '',
      tech: '',
      other: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-route-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    async function confirmAccount(userId: string, channel: string, externalId: string) {
      await db
        .insert(notificationAccounts)
        .values({ userId, channel, externalId, verifiedAt: new Date() })
        .onConflictDoNothing()
    }

    function createShift(cookie: string, body: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/oncall/shifts',
        headers: { cookie },
        payload: { poolId, ...body },
      })
    }

    function patchShift(cookie: string, id: string, body: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/oncall/shifts/${id}`,
        headers: { cookie },
        payload: body,
      })
    }

    function deleteShift(cookie: string, id: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/oncall/shifts/${id}`,
        headers: { cookie },
      })
    }

    function postConfirm(cookie: string, id: string) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/oncall/shifts/${id}/confirm`,
        headers: { cookie },
      })
    }

    function outboxRowsOf(eventType: string) {
      return db
        .select({
          shiftId: outbox.shiftId,
          eventType: outbox.eventType,
          channel: outbox.channel,
          target: outbox.target,
        })
        .from(outbox)
        .where(eq(outbox.eventType, eventType))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-release@example.org')
      techId = await userIdFor('tech-release@example.org')
      otherId = await userIdFor('other-release@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: techId, roleId: await roleIdFor('oncall') },
        { userId: otherId, roleId: await roleIdFor('oncall') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Bereitschaftsplan' })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['tech'] = await sessionCookieFor(techId)
      cookies['other'] = await sessionCookieFor(otherId)

      // The channels of the technicians (ADR-0045): the message of the release
      // goes over the confirmed accounts of the technician who had the shift.
      await confirmAccount(techId, 'telegram', '-555000111')
      await confirmAccount(otherId, 'telegram', '-555000222')

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

    it('tells the technician that his shift was deleted (ADR-0058)', async () => {
      const created = await createShift(cookies['admin'], { userId: techId, publish: true })
      const shiftId = created.json<ShiftRow>().id

      const deleted = await deleteShift(cookies['admin'], shiftId)

      expect(deleted.statusCode).toBe(204)

      const rows = await outboxRowsOf('oncall.released')
      const row = onlyRow(
        rows.filter((entry) => (entry.target as Record<string, unknown>)['assignedTo'] === techId),
        'release row',
      )

      // The row points at no shift: the shift is gone and the message has to
      // survive its delete.
      expect(row.shiftId).toBeNull()
      expect(row.channel).toBe('telegram')
      expect((row.target as Record<string, unknown>)['release']).toBe('deleted')
      expect((row.target as Record<string, unknown>)['poolName']).toBe('Bereitschaftsplan')

      const shifts = await db
        .select({ id: oncallShifts.id })
        .from(oncallShifts)
        .where(eq(oncallShifts.id, shiftId))

      expect(shifts).toHaveLength(0)
    })

    it('tells the technician that his shift went to another one (ADR-0058)', async () => {
      const created = await createShift(cookies['admin'], { userId: techId, publish: true })
      const shiftId = created.json<ShiftRow>().id

      const confirmed = await postConfirm(cookies['tech'], shiftId)

      expect(confirmed.statusCode).toBe(200)
      expect(confirmed.json<ShiftRow>().state).toBe('CONFIRMED')

      const handedOver = await patchShift(cookies['admin'], shiftId, { userId: otherId })

      expect(handedOver.statusCode).toBe(200)
      expect(handedOver.json<ShiftRow>().userId).toBe(otherId)

      const rows = await outboxRowsOf('oncall.released')
      const row = onlyRow(
        rows.filter((entry) => (entry.target as Record<string, unknown>)['assignedTo'] === techId),
        'release row of the handover',
      )

      expect(row.shiftId).toBe(shiftId)
      expect((row.target as Record<string, unknown>)['release']).toBe('reassigned')
    })

    it('tells nobody when the shift had no technician', async () => {
      const created = await createShift(cookies['admin'], {})
      const shiftId = created.json<ShiftRow>().id

      const deleted = await deleteShift(cookies['admin'], shiftId)

      expect(deleted.statusCode).toBe(204)

      const rows = await outboxRowsOf('oncall.released')

      expect(rows).toHaveLength(0)
    })
  },
)
