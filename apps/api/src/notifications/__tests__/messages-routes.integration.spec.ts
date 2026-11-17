import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationMessages } from '../../db/schema'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped notification inbox routes integration: ${testDatabase.reason}\n`)
}

const { users } = schema

type MessageBody = {
  messages: Array<{
    id: string
    channel: string
    eventType: string
    state: string
    title: string
    body: string
    createdAt: string
    readAt: string | null
  }>
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the routes of the notification inbox (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let ownerId = ''
    let otherId = ''
    let ownerCookie = ''
    let otherCookie = ''

    async function userIdFor(email: string): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-inbox-user' })
        .returning({ id: users.id })

      return row!.id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    async function messageFor(
      userId: string,
      title: string,
      state: string,
      createdAt: Date,
    ): Promise<string> {
      const [row] = await db
        .insert(notificationMessages)
        .values({
          userId,
          channel: 'ntfy',
          eventType: 'ticket.created',
          state,
          title,
          body: 'normal · Rathaus',
          createdAt,
        })
        .returning({ id: notificationMessages.id })

      return row!.id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      ownerId = await userIdFor('inbox-owner@example.org')
      otherId = await userIdFor('inbox-other@example.org')
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

    const getMessages = (cookie?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/notifications/messages',
        headers: cookie === undefined ? {} : { cookie },
      })

    const getUnreadCount = (cookie?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/notifications/messages/unread-count',
        headers: cookie === undefined ? {} : { cookie },
      })

    const markRead = (cookie: string, id: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/messages/${id}/read`,
        headers: { cookie },
      })

    it('refuses the inbox without a session', async () => {
      const list = await getMessages()
      const count = await getUnreadCount()

      expect(list.statusCode).toBe(401)
      expect(list.json<{ code?: string }>().code).toBe('session_invalid')
      expect(count.statusCode).toBe(401)
    })

    it('answers the own messages with the newest first and hides the messages of another user', async () => {
      const older = await messageFor(ownerId, 'ST-2026-0100', 'SENT', new Date('2026-01-01T10:00:00Z'))
      const newer = await messageFor(ownerId, 'ST-2026-0200', 'FAILED', new Date('2026-01-02T10:00:00Z'))
      await messageFor(otherId, 'ST-2026-0300', 'SENT', new Date('2026-01-03T10:00:00Z'))

      const response = await getMessages(ownerCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<MessageBody>()

      expect(body.messages.map((message) => message.title)).toEqual([
        'ST-2026-0200',
        'ST-2026-0100',
      ])
      expect(body.messages.every((message) => message.title !== 'ST-2026-0300')).toBe(true)
      expect(body.messages[0]?.state).toBe('FAILED')
      expect(body.messages[0]?.readAt).toBeNull()

      // The rows of the other user stay untouched.
      const foreign = await db
        .select({ readAt: notificationMessages.readAt })
        .from(notificationMessages)
        .where(eq(notificationMessages.title, 'ST-2026-0300'))

      expect(foreign[0]?.readAt).toBeNull()
      expect(newer).not.toBe(older)
    })

    it('counts the unread messages of the own user', async () => {
      const response = await getUnreadCount(ownerCookie)

      expect(response.statusCode).toBe(200)
      expect(response.json<{ count: number }>().count).toBeGreaterThanOrEqual(2)

      const other = await getUnreadCount(otherCookie)

      expect(other.json<{ count: number }>().count).toBe(1)
    })

    it('marks an own message as read and refuses the message of another user', async () => {
      const own = await messageFor(ownerId, 'ST-2026-0400', 'SENT', new Date('2026-01-04T10:00:00Z'))
      const foreign = await messageFor(otherId, 'ST-2026-0500', 'SENT', new Date('2026-01-05T10:00:00Z'))

      const response = await markRead(ownerCookie, own)

      expect(response.statusCode).toBe(200)
      expect(response.json<{ id: string; readAt: string | null }>().id).toBe(own)
      expect(response.json<{ readAt: string | null }>().readAt).not.toBeNull()

      const refused = await markRead(ownerCookie, foreign)

      expect(refused.statusCode).toBe(404)
      expect(refused.json<{ code?: string }>().code).toBe('message_not_found')

      const unchanged = await db
        .select({ readAt: notificationMessages.readAt })
        .from(notificationMessages)
        .where(eq(notificationMessages.id, foreign))

      expect(unchanged[0]?.readAt).toBeNull()
    })
  },
)
