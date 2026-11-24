import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationAccounts, oncallPools, outbox } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call allocation notifications integration: ${testDatabase.reason}\n`)
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
  'on-call allocation and swap notifications (integration)',
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

    /**
     * The account of a technician is confirmed (§11.3a, ADR-0045): a code over
     * the channel proved that the address works. The account is the way of the
     * technician — there is no selection per event type any more.
     */
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

    function postConfirm(cookie: string, id: string) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/oncall/shifts/${id}/confirm`,
        headers: { cookie },
      })
    }

    function postSwap(cookie: string, id: string, body?: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/oncall/shifts/${id}/swap`,
        headers: { cookie },
        payload: body,
      })
    }

    function outboxRows(shiftId: string) {
      return db
        .select({
          shiftId: outbox.shiftId,
          ticketId: outbox.ticketId,
          eventType: outbox.eventType,
          channel: outbox.channel,
          target: outbox.target,
        })
        .from(outbox)
        .where(eq(outbox.shiftId, shiftId))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-allocation@example.org')
      techId = await userIdFor('tech-allocation@example.org')
      otherId = await userIdFor('other-allocation@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: techId, roleId: await roleIdFor('oncall') },
        { userId: otherId, roleId: await roleIdFor('oncall') },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: 'Staffada' })
        .returning({ id: oncallPools.id })

      poolId = pool!.id

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['tech'] = await sessionCookieFor(techId)
      cookies['other'] = await sessionCookieFor(otherId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.NTFY_URL = 'https://ntfy.example.invalid/'
      process.env.NTFY_TOPIC = 'instance-topic'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('queues the assigned technician without a selection over the instance chain', async () => {
      const created = await createShift(cookies['admin'], { userId: techId })

      expect(created.statusCode).toBe(201)
      const shiftId = created.json<ShiftRow>().id
      expect(created.json<ShiftRow>().state).toBe('DRAFT')

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(1)
      const row = onlyRow(rows, 'allocation row')
      expect(row.shiftId).toBe(shiftId)
      expect(row.ticketId).toBeNull()
      expect(row.eventType).toBe('oncall.assigned')
      expect(row.channel).toBe('ntfy')
    })

    it('queues the selected channel of a technician who selected one', async () => {
      await confirmAccount(otherId, 'telegram', '-555111222333')

      const created = await createShift(cookies['admin'], { userId: otherId, publish: true })

      expect(created.statusCode).toBe(201)
      const shiftId = created.json<ShiftRow>().id

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(1)
      const row = onlyRow(rows, 'selected allocation row')
      expect(row.eventType).toBe('oncall.assigned')
      expect(row.channel).toBe('telegram')
    })

    it('queues nothing for an unfilled slot without a technician', async () => {
      const created = await createShift(cookies['admin'], {})

      expect(created.statusCode).toBe(201)
      const shiftId = created.json<ShiftRow>().id

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(0)
    })

    it('queues the allocation of the assign patch', async () => {
      const created = await createShift(cookies['admin'], {})
      const shiftId = created.json<ShiftRow>().id

      const patched = await patchShift(cookies['admin'], shiftId, { userId: techId })

      expect(patched.statusCode).toBe(200)
      expect(patched.json<ShiftRow>().state).toBe('DRAFT')

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(1)
      expect(onlyRow(rows, 'patch allocation row').eventType).toBe('oncall.assigned')
    })

    it('queues no second allocation row while the first is still queued', async () => {
      const created = await createShift(cookies['admin'], { userId: techId })
      const shiftId = created.json<ShiftRow>().id

      const first = await outboxRows(shiftId)

      expect(first).toHaveLength(1)

      const published = await patchShift(cookies['admin'], shiftId, { userId: techId, publish: true })

      expect(published.statusCode).toBe(200)
      expect(published.json<ShiftRow>().state).toBe('PLANNED')

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(1)
    })

    it('queues the new technician when the shift is reassigned (WP-M23-08)', async () => {
      const created = await createShift(cookies['admin'], { userId: techId })
      const shiftId = created.json<ShiftRow>().id

      const first = await outboxRows(shiftId)

      expect(first).toHaveLength(1)

      // the technician declines and the admin assigns another one: the new
      // technician must hear of his shift
      const patched = await patchShift(cookies['admin'], shiftId, { userId: otherId })

      expect(patched.statusCode).toBe(200)

      const rows = await outboxRows(shiftId)

      expect(rows).toHaveLength(2)
      expect(
        rows.filter((row) => (row.target as { assignedTo?: string }).assignedTo === otherId),
      ).toHaveLength(1)
      expect(
        rows.filter((row) => (row.target as { assignedTo?: string }).assignedTo === techId),
      ).toHaveLength(1)
    })

    it('queues a swap request for the requester and the named target', async () => {
      const created = await createShift(cookies['admin'], { userId: techId, publish: true })
      const shiftId = created.json<ShiftRow>().id

      await confirmAccount(otherId, 'telegram', '-555111222333')

      const confirmed = await postConfirm(cookies['tech'], shiftId)

      expect(confirmed.statusCode).toBe(200)
      expect(confirmed.json<ShiftRow>().state).toBe('CONFIRMED')

      const response = await postSwap(cookies['tech'], shiftId, { targetUserId: otherId })

      expect(response.statusCode).toBe(201)

      const rows = await outboxRows(shiftId)
      const requested = rows.filter((row) => row.eventType === 'oncall.swap_requested')

      expect(requested).toHaveLength(2)
      expect(requested.some((row) => row.channel === 'ntfy')).toBe(true)
      expect(requested.some((row) => row.channel === 'telegram')).toBe(true)
    })

    it('notifies only the requester when the whole pool is asked', async () => {
      const created = await createShift(cookies['admin'], { userId: techId, publish: true })
      const shiftId = created.json<ShiftRow>().id

      const confirmed = await postConfirm(cookies['tech'], shiftId)

      expect(confirmed.statusCode).toBe(200)

      const response = await postSwap(cookies['tech'], shiftId)

      expect(response.statusCode).toBe(201)

      const rows = await outboxRows(shiftId)
      const requested = rows.filter((row) => row.eventType === 'oncall.swap_requested')

      expect(requested).toHaveLength(1)
      expect(onlyRow(requested, 'pool swap row').channel).toBe('ntfy')
    })
  },
)
