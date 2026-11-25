import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationItems, notificationMessages, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { enqueuePersonalDeliveries } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped notification task routes integration: ${testDatabase.reason}\n`)
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

describe.skipIf(testDatabase.status === 'unavailable')(
  'the routes of the tasks of a user (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let ownerId = ''
    let otherId = ''
    let ownerCookie = ''
    let otherCookie = ''
    let ticketId = ''
    let ticketNo = ''

    async function userIdFor(email: string): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-task-user' })
        .returning({ id: users.id })

      return row!.id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    const getItems = (cookie?: string, query = '') =>
      app.inject({
        method: 'GET',
        url: `/api/v1/notifications/items${query}`,
        headers: cookie === undefined ? {} : { cookie },
      })

    const getUnreadCount = (cookie?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/notifications/items/unread-count',
        headers: cookie === undefined ? {} : { cookie },
      })

    const markRead = (cookie: string, id: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/items/${id}/read`,
        headers: { cookie },
      })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: '9800_02', name: 'task probe object' })
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

      ownerId = await userIdFor('task-owner@example.org')
      otherId = await userIdFor('task-other@example.org')
      ownerCookie = await sessionCookieFor(ownerId)
      otherCookie = await sessionCookieFor(otherId)

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

    it('refuses the tasks without a session', async () => {
      const list = await getItems()
      const count = await getUnreadCount()

      expect(list.statusCode).toBe(401)
      expect(list.json<{ code?: string }>().code).toBe('session_invalid')
      expect(count.statusCode).toBe(401)
    })

    it('writes one task for three channels of the same user and three attempts', async () => {
      const written = await enqueuePersonalDeliveries(db, [
        {
          userId: ownerId,
          channel: 'ntfy',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: {
            ticketNo,
            priority: 'normal',
            objectName: 'Rathaus',
            ntfyTopic: 'the-secret-topic',
          },
        },
        {
          userId: ownerId,
          channel: 'telegram',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: {
            ticketNo,
            priority: 'normal',
            objectName: 'Rathaus',
            recipientTarget: 'the-chat-id',
          },
        },
        {
          userId: ownerId,
          channel: 'email',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: {
            ticketNo,
            priority: 'normal',
            objectName: 'Rathaus',
          },
        },
      ])

      expect(written).toBe(3)

      const tasks = await db.select().from(notificationItems).where(eq(notificationItems.userId, ownerId))
      const attempts = await db
        .select()
        .from(notificationMessages)
        .where(eq(notificationMessages.userId, ownerId))

      // One task for the user and the event — the three channels carry the
      // same message (§11.18, ADR-0052).
      expect(tasks.length).toBe(1)
      expect(attempts.length).toBe(3)
      expect(attempts.every((attempt) => attempt.notificationItemId === tasks[0]?.id)).toBe(true)

      // The task carries the params of the message — but never the target of
      // the user (§11.13).
      expect(tasks[0]?.params).toEqual({
        ticketNo,
        priority: 'normal',
        objectName: 'Rathaus',
      })
      expect(tasks[0]?.ticketNo).toBe(ticketNo)
      expect(tasks[0]?.readAt).toBeNull()
    })

    it('answers the tasks of the signed-in user only', async () => {
      const response = await getItems(ownerCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<ItemBody>()

      expect(body.items).toHaveLength(1)
      expect(body.items[0]?.eventType).toBe('ticket.assigned')
      expect(body.items[0]?.ticketNo).toBe(ticketNo)
      expect(body.items[0]?.readAt).toBeNull()

      // The task of another user stays invisible.
      const foreign = await getItems(otherCookie)

      expect(foreign.json<ItemBody>().items).toHaveLength(0)
    })

    it('counts the unhandled tasks and quits them with the receipt', async () => {
      const count = await getUnreadCount(ownerCookie)

      expect(count.statusCode).toBe(200)
      expect(count.json<{ count: number }>().count).toBe(1)

      const list = await getItems(ownerCookie)
      const id = list.json<ItemBody>().items[0]!.id

      const receipt = await markRead(ownerCookie, id)

      expect(receipt.statusCode).toBe(200)
      expect(receipt.json<{ id: string }>().id).toBe(id)
      expect(receipt.json<{ readAt: string | null }>().readAt).not.toBeNull()

      const after = await getUnreadCount(ownerCookie)

      expect(after.json<{ count: number }>().count).toBe(0)
    })

    it('refuses the receipt of a task of another user', async () => {
      const [task] = await db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.userId, ownerId))
        .limit(1)

      const receipt = await markRead(otherCookie, task!.id)

      expect(receipt.statusCode).toBe(404)
      expect(receipt.json<{ code?: string }>().code).toBe('message_not_found')
    })

    it('answers the tasks of an event type and refuses an unknown filter', async () => {
      const filtered = await getItems(ownerCookie, '?eventType=ticket.assigned')

      expect(filtered.statusCode).toBe(200)
      expect(filtered.json<ItemBody>().items).toHaveLength(1)

      const other = await getItems(ownerCookie, '?eventType=ticket.escalated')

      expect(other.json<ItemBody>().items).toHaveLength(0)

      const broken = await getItems(ownerCookie, '?unread=maybe')

      expect(broken.statusCode).toBe(400)
      expect(broken.json<{ code?: string }>().code).toBe('invalid_request')
    })
  },
)
