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
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped notification inbox routes integration: ${testDatabase.reason}\n`)
}

const { permissions, userPermissions, users } = schema

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
    recipient: { userId: string; name: string } | null
  }>
  recipients: Array<{ userId: string; name: string; count: number }>
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
    let auditorCookie = ''

    async function userIdFor(email: string, givenName = '', familyName = ''): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-inbox-user', givenName, familyName })
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
      channel = 'ntfy',
      eventType = 'ticket.created',
    ): Promise<string> {
      const [row] = await db
        .insert(notificationMessages)
        .values({
          userId,
          channel,
          eventType,
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
      await seedRbac(db)

      ownerId = await userIdFor('inbox-owner@example.org', 'Ola', 'Owner')
      otherId = await userIdFor('inbox-other@example.org', 'Otto', 'Other')
      ownerCookie = await sessionCookieFor(ownerId)
      otherCookie = await sessionCookieFor(otherId)

      // The auditor holds the permission `notification.read_all` over one
      // explicit allow — the key belongs to no default role (WP-M14-141a).
      const auditorId = await userIdFor('inbox-auditor@example.org', 'Anna', 'Auditor')
      const [permission] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, 'notification.read_all'))

      await db
        .insert(userPermissions)
        .values({ userId: auditorId, permissionId: permission!.id, effect: 'allow' })
      auditorCookie = await sessionCookieFor(auditorId)

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

    const getMessages = (cookie?: string, query = '') =>
      app.inject({
        method: 'GET',
        url: `/api/v1/notifications/messages${query}`,
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

    it('keeps the inbox personal without the permission: no addressee, no foreign messages', async () => {
      const response = await getMessages(ownerCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<MessageBody>()

      expect(body.messages.every((message) => message.recipient === null)).toBe(true)
      expect(body.recipients).toEqual([])
      expect(body.messages.every((message) => message.title !== 'ST-2026-0300')).toBe(true)
    })

    it('refuses the messages of another user without the permission', async () => {
      const response = await getMessages(ownerCookie, `?userId=${otherId}`)

      expect(response.statusCode).toBe(403)
      expect(response.json<{ code?: string }>().code).toBe('forbidden')
    })

    it('rejects an unknown value of a filter', async () => {
      const channel = await getMessages(ownerCookie, '?channel=carrier-pigeon')
      const event = await getMessages(ownerCookie, '?eventType=ticket.nonsense')
      const state = await getMessages(ownerCookie, '?state=lost')
      const addressee = await getMessages(ownerCookie, '?userId=not-a-uuid')
      const unread = await getMessages(ownerCookie, '?unread=maybe')

      for (const response of [channel, event, state, addressee, unread]) {
        expect(response.statusCode).toBe(400)
        expect(response.json<{ code?: string }>().code).toBe('invalid_request')
      }
    })

    it('answers the messages of every user with the permission and names the addressee', async () => {
      await messageFor(otherId, 'ST-2026-0600', 'SENT', new Date('2026-01-06T10:00:00Z'), 'email')

      const response = await getMessages(auditorCookie, '?limit=200')

      expect(response.statusCode).toBe(200)

      const body = response.json<MessageBody>()
      const foreign = body.messages.find((message) => message.title === 'ST-2026-0600')

      expect(foreign).toBeDefined()
      expect(foreign?.recipient?.userId).toBe(otherId)
      expect(foreign?.recipient?.name).toBe('Otto Other')

      const addressees = body.recipients.map((recipient) => recipient.userId)

      expect(addressees).toContain(ownerId)
      expect(addressees).toContain(otherId)
      expect(
        body.recipients.find((recipient) => recipient.userId === otherId)?.count,
      ).toBeGreaterThanOrEqual(1)
    })

    it('narrows the answer with the filters of the addressee, the channel and the state', async () => {
      const byAddressee = await getMessages(auditorCookie, `?userId=${ownerId}&limit=200`)
      const byChannel = await getMessages(auditorCookie, '?channel=email&limit=200')
      const byState = await getMessages(auditorCookie, '?state=FAILED&limit=200')
      const byUnread = await getMessages(auditorCookie, '?unread=true&limit=200')

      expect(byAddressee.statusCode).toBe(200)
      expect(
        byAddressee.json<MessageBody>().messages.every((message) => message.recipient?.userId === ownerId),
      ).toBe(true)

      expect(byChannel.statusCode).toBe(200)
      expect(
        byChannel.json<MessageBody>().messages.every((message) => message.channel === 'email'),
      ).toBe(true)

      expect(byState.statusCode).toBe(200)
      expect(
        byState.json<MessageBody>().messages.every((message) => message.state === 'FAILED'),
      ).toBe(true)

      expect(byUnread.statusCode).toBe(200)
      expect(
        byUnread.json<MessageBody>().messages.every((message) => message.readAt === null),
      ).toBe(true)
    })
  },
)
