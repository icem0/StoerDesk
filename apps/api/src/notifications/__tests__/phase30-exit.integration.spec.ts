import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { loadEnv } from '../../config/env'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import {
  notificationAccounts,
  notificationItems,
  notificationMessages,
  roles,
  userRoles,
  users,
} from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { DELIVERY_FAILURE_EVENT } from '../alarm'
import { drainOutbox, enqueuePersonalDeliveries } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase-30 exit criterion: ${testDatabase.reason}\n`)
}

type ItemBody = {
  items: Array<{
    id: string
    eventType: string
    params: Record<string, unknown>
    ticketNo: string | null
    shiftId: string | null
    createdAt: string
    readAt: string | null
  }>
}

type AttemptBody = {
  attempts: Array<{
    id: string
    recipient: { userId: string; name: string }
    eventType: string
    channel: string
    state: string
    title: string
    errorCode: string | null
    attempts: number
    createdAt: string
    updatedAt: string
  }>
  recipients: Array<{ userId: string; name: string; count: number }>
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase-30 exit criterion — the message is a task, the delivery attempt is the protocol, a failed delivery becomes a task of the administration (WP-M30-06)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: Awaited<ReturnType<typeof buildServer>> | undefined
    let adminId = ''
    let adminCookie = ''
    let techId = ''
    let techCookie = ''
    let ticketId = ''
    let ticketNo = ''

    const unique = (name: string) => `exit30-${name}-${randomUUID().slice(0, 8)}`

    async function userWithRole(email: string, roleKey: string): Promise<string> {
      const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey))
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: 'not-a-real-hash' })
        .returning({ id: users.id })

      if (role !== undefined && user !== undefined) {
        await db.insert(userRoles).values({ userId: user.id, roleId: role.id })
      }

      return user?.id ?? ''
    }

    /** A confirmed account of a user — the channel of the user (ADR-0045). */
    async function confirmedAccount(userId: string, channel: string): Promise<void> {
      await db.insert(notificationAccounts).values({
        userId,
        channel,
        externalId: `exit30-${channel}-${userId.slice(0, 8)}`,
        target: `exit30-target-${userId.slice(0, 8)}`,
        verifiedAt: new Date(),
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userWithRole(unique('admin@example.invalid'), 'admin')
      techId = await userWithRole(unique('tech@example.invalid'), 'oncall')

      adminCookie = `session=${(await createSession(db, adminId, 1)).token}`
      techCookie = `session=${(await createSession(db, techId, 1)).token}`

      // The technician has three confirmed channels — the message goes over all
      // three and is still **one** task.
      await confirmedAccount(techId, 'ntfy')
      await confirmedAccount(techId, 'telegram')
      await confirmedAccount(techId, 'email')
      await confirmedAccount(adminId, 'ntfy')

      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: `9800_${randomUUID().slice(0, 4)}`, name: 'exit 30 object' })
        .returning({ id: schema.objects.id })

      const [ticket] = await db
        .insert(schema.tickets)
        .values({
          objectId: object!.id,
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        })
        .returning({ id: schema.tickets.id, ticketNo: schema.tickets.ticketNo })

      ticketId = ticket!.id
      ticketNo = ticket!.ticketNo

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
    })

    afterAll(async () => {
      if (app !== undefined) {
        await app.close()
      }

      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('one message over three channels is one task and three attempts', async () => {
      await enqueuePersonalDeliveries(db, [
        {
          userId: techId,
          channel: 'ntfy',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
        {
          userId: techId,
          channel: 'telegram',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
        {
          userId: techId,
          channel: 'email',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
      ])

      const tasks = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.userId, techId))

      const attempts = await db
        .select()
        .from(notificationMessages)
        .where(eq(notificationMessages.userId, techId))

      expect(tasks.length).toBe(1)
      expect(attempts.length).toBe(3)
      expect(attempts.every((attempt) => attempt.notificationItemId === tasks[0]?.id)).toBe(true)
    })

    it('the inbox answers the tasks of the user and nothing else', async () => {
      app = await buildServer()

      try {
        const list = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/items',
          headers: { cookie: techCookie },
        })

        expect(list.statusCode).toBe(200)

        const body = list.json<ItemBody>()

        expect(body.items.length).toBe(1)
        expect(body.items[0]?.ticketNo).toBe(ticketNo)
        expect(body.items[0]?.readAt).toBeNull()

        // The answer names neither a channel nor a delivery state — the way of
        // a message belongs to the protocol (§11.16).
        expect(Object.keys(body.items[0] ?? {})).not.toContain('channel')
        expect(Object.keys(body.items[0] ?? {})).not.toContain('state')

        // The task of another user stays invisible.
        const foreign = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/items',
          headers: { cookie: adminCookie },
        })

        expect(foreign.json<ItemBody>().items.length).toBe(0)

        const count = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/items/unread-count',
          headers: { cookie: techCookie },
        })

        expect(count.json<{ count: number }>().count).toBe(1)

        const receipt = await app.inject({
          method: 'PATCH',
          url: `/api/v1/notifications/items/${body.items[0]?.id}/read`,
          headers: { cookie: techCookie },
        })

        expect(receipt.statusCode).toBe(200)
        expect(receipt.json<{ readAt: string | null }>().readAt).not.toBeNull()

        // The receipt of a task of another user is refused.
        const refused = await app.inject({
          method: 'PATCH',
          url: `/api/v1/notifications/items/${body.items[0]?.id}/read`,
          headers: { cookie: adminCookie },
        })

        expect(refused.statusCode).toBe(404)
        expect(refused.json<{ code?: string }>().code).toBe('message_not_found')
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('the protocol belongs to the administration', async () => {
      app = await buildServer()

      try {
        const withoutRight = await app.inject({
          method: 'GET',
          url: '/api/v1/admin/notifications/attempts',
          headers: { cookie: techCookie },
        })

        expect(withoutRight.statusCode).toBe(403)
        expect(withoutRight.json<{ code?: string }>().code).toBe('forbidden')

        const attempts = await app.inject({
          method: 'GET',
          url: '/api/v1/admin/notifications/attempts',
          headers: { cookie: adminCookie },
        })

        expect(attempts.statusCode).toBe(200)

        const body = attempts.json<AttemptBody>()

        expect(body.attempts.length).toBe(3)
        expect(body.attempts.every((attempt) => attempt.recipient.userId === techId)).toBe(true)
        expect(body.attempts.map((attempt) => attempt.channel).sort()).toEqual([
          'email',
          'ntfy',
          'telegram',
        ])
        expect(body.recipients[0]?.count).toBe(3)
      } finally {
        await app.close()
        app = undefined
      }
    })

    it('a message that never arrived becomes a task of the administration', async () => {
      // The three deliveries of the first case are still waiting — they fail
      // now and write their own alarms. The count is taken after them.
      await drainOutbox(db, loadEnv({}))

      const before = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT))

      await enqueuePersonalDeliveries(db, [
        {
          userId: techId,
          channel: 'matrix',
          eventType: 'ticket.escalated',
          title: ticketNo,
          body: 'high · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'high', objectName: 'Rathaus' },
        },
      ])

      // No channel is configured — the send fails and the chain of the
      // installation has no next channel: the message never arrives.
      await drainOutbox(db, loadEnv({}))

      const tasks = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT))

      // One task more — the one of the channel that failed. The alarm went to
      // the administration over his own confirmed channel (ADR-0045).
      expect(tasks.length).toBe(before.length + 1)
      expect(tasks[tasks.length - 1]?.userId).toBe(adminId)
      expect(tasks[tasks.length - 1]?.params).toMatchObject({ channel: 'matrix' })
    })

    it('the alarm is throttled and never alarms itself', async () => {
      const before = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT))

      await enqueuePersonalDeliveries(db, [
        {
          userId: techId,
          channel: 'matrix',
          eventType: 'ticket.escalated',
          title: ticketNo,
          body: 'high · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'high', objectName: 'Rathaus' },
        },
      ])

      await drainOutbox(db, loadEnv({}))

      const after = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT))

      // The second failure of the same channel with the same machine code
      // writes no second task — a broken channel must not flood the inbox.
      expect(after.length).toBe(before.length)
    })
  },
)
