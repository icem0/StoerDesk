import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationMessages, permissions, userPermissions, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { enqueuePersonalDeliveries } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped delivery protocol routes integration: ${testDatabase.reason}\n`)
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
  'the route of the protocol of the delivery (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let receiverId = ''
    let receiverCookie = ''
    let auditorCookie = ''
    let ticketId = ''
    let ticketNo = ''

    async function userIdFor(email: string, givenName: string): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-protocol-user', givenName })
        .returning({ id: users.id })

      return row!.id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    const getDeliveries = (cookie?: string, query = '') =>
      app.inject({
        method: 'GET',
        url: `/api/v1/admin/notifications/attempts${query}`,
        headers: cookie === undefined ? {} : { cookie },
      })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: '9800_03', name: 'protocol probe object' })
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

      receiverId = await userIdFor('protocol-receiver@example.org', 'Rita')
      receiverCookie = await sessionCookieFor(receiverId)

      // The auditor holds the permission `notification.read_all` over one
      // explicit allow — the protocol names the users (§11.16).
      const auditorId = await userIdFor('protocol-auditor@example.org', 'Anna')
      const [permission] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, 'notification.read_all'))

      await db
        .insert(userPermissions)
        .values({ userId: auditorId, permissionId: permission!.id, effect: 'allow' })
      auditorCookie = await sessionCookieFor(auditorId)

      await enqueuePersonalDeliveries(db, [
        {
          userId: receiverId,
          channel: 'ntfy',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
        {
          userId: receiverId,
          channel: 'telegram',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
      ])

      // The ntfy attempt failed, the telegram one went through.
      const attempts = await db
        .select({ id: notificationMessages.id, channel: notificationMessages.channel })
        .from(notificationMessages)
        .where(eq(notificationMessages.userId, receiverId))

      const failed = attempts.find((attempt) => attempt.channel === 'ntfy')
      const sent = attempts.find((attempt) => attempt.channel === 'telegram')

      if (failed !== undefined) {
        await db
          .update(notificationMessages)
          .set({ state: 'FAILED' })
          .where(eq(notificationMessages.id, failed.id))
      }

      if (sent !== undefined) {
        await db
          .update(notificationMessages)
          .set({ state: 'SENT' })
          .where(eq(notificationMessages.id, sent.id))
      }

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

    it('refuses the protocol without a session and without the right', async () => {
      const withoutSession = await getDeliveries()

      expect(withoutSession.statusCode).toBe(401)

      const withoutRight = await getDeliveries(receiverCookie)

      expect(withoutRight.statusCode).toBe(403)
      expect(withoutRight.json<{ code?: string }>().code).toBe('forbidden')
    })

    it('answers the attempts with their recipient, their channel and their state', async () => {
      const response = await getDeliveries(auditorCookie)

      expect(response.statusCode).toBe(200)

      const body = response.json<AttemptBody>()

      expect(body.attempts.length).toBe(2)
      expect(body.attempts.every((attempt) => attempt.recipient.userId === receiverId)).toBe(true)
      expect(body.attempts.map((attempt) => attempt.channel).sort()).toEqual(['ntfy', 'telegram'])
      expect(body.attempts.map((attempt) => attempt.state).sort()).toEqual(['FAILED', 'SENT'])
      expect(body.attempts[0]?.title).toBe(ticketNo)

      // The list of the recipients carries the number of their attempts.
      expect(body.recipients.length).toBe(1)
      expect(body.recipients[0]?.count).toBe(2)
    })

    it('narrows the answer with the filters', async () => {
      const byChannel = await getDeliveries(auditorCookie, '?channel=ntfy')

      expect(byChannel.json<AttemptBody>().attempts.length).toBe(1)
      expect(byChannel.json<AttemptBody>().attempts[0]?.channel).toBe('ntfy')

      const byState = await getDeliveries(auditorCookie, '?state=SENT')

      expect(byState.json<AttemptBody>().attempts.length).toBe(1)
      expect(byState.json<AttemptBody>().attempts[0]?.state).toBe('SENT')

      const byRecipient = await getDeliveries(
        auditorCookie,
        `?userId=${receiverId}&eventType=ticket.assigned`,
      )

      expect(byRecipient.json<AttemptBody>().attempts.length).toBe(2)

      const byEvent = await getDeliveries(auditorCookie, '?eventType=ticket.escalated')

      expect(byEvent.json<AttemptBody>().attempts.length).toBe(0)
    })

    it('refuses an unknown filter', async () => {
      const broken = await getDeliveries(auditorCookie, '?state=SENDING')

      expect(broken.statusCode).toBe(400)
      expect(broken.json<{ code?: string }>().code).toBe('invalid_request')
    })
  },
)
