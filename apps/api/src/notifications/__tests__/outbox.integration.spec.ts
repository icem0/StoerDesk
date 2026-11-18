import http from 'node:http'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { notificationMessages, tickets, ticketEvents, outbox, users } from '../../db/schema'
import * as schema from '../../db/schema'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import {
  drainOutbox,
  enqueuePersonalDeliveries,
  NOTIFICATION_OUTBOX_CRON,
  NOTIFICATION_OUTBOX_QUEUE,
} from '../outbox'

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped notification outbox drain integration: ${testDatabase.reason}\n`)
}

describe('notification outbox drain — queue and schedule', () => {
  it('uses the documented queue and per-minute cron', () => {
    expect(NOTIFICATION_OUTBOX_QUEUE).toBe('notification-outbox')
    expect(NOTIFICATION_OUTBOX_CRON).toBe('* * * * *')
  })
})

describe.skipIf(testDatabase.status === 'unavailable')(
  'notification outbox drain (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let ticketId = ''
    let ticketNo = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const insertedObject = onlyRow(
        await db
          .insert(schema.objects)
          .values({ objectNo: '9800_01', name: 'drain probe object' })
          .returning({ id: schema.objects.id }),
        'object',
      )

      const insertedTicket = onlyRow(
        await db
          .insert(tickets)
          .values({
            objectId: insertedObject.id,
            reportedAt: new Date(),
            deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          })
          .returning({ id: tickets.id, ticketNo: tickets.ticketNo }),
        'ticket',
      )

      ticketId = insertedTicket.id
      ticketNo = insertedTicket.ticketNo

      await db.insert(ticketEvents).values({
        ticketId,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    const envOf = (ntfyUrl: string): Env =>
      loadEnv({ NTFY_URL: ntfyUrl, NTFY_TOPIC: 'outbox-test' })

    const rowOf = (channel: string) => ({
      ticketId,
      channel,
      target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
    })

    const drainedWithState = async (state: string) => {
      const rows = await db
        .select({ state: outbox.state, attempts: outbox.attempts })
        .from(outbox)
        .where(and(eq(outbox.ticketId, ticketId), eq(outbox.state, state)))

      return rows
    }

    const eventsOf = async () =>
      db
        .select({
          type: ticketEvents.type,
          actorKind: ticketEvents.actorKind,
          payload: ticketEvents.payload,
        })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

    it('fails a row with retries and leaves the `created` event of the ticket intact', async () => {
      const env = envOf('http://127.0.0.1:1/')

      await db.insert(outbox).values(rowOf('ntfy'))

      const result = await drainOutbox(db, env)

      expect(result).toEqual({ sent: 0, failed: 1, fallback: 0, attempts: 3 })

      const drained = onlyRow(await drainedWithState('FAILED'), 'outbox row')

      expect(drained.attempts).toBe(3)

      const events = await eventsOf()

      expect(events.map((event) => event.type)).toContain('created')
      const failedEvent = events.find((event) => event.type === 'notification_failed')

      expect(failedEvent).toBeDefined()
      expect(failedEvent?.actorKind).toBe('system')
      expect(failedEvent?.payload).toEqual({ channel: 'ntfy', ticketNo, attempts: 3, errorCode: 'send_failed' })
    })

    it('sends through a local server and appends one `notification_sent` event', async () => {
      const bodies: unknown[] = []

      const server = http.createServer((req, res) => {
        let data = ''

        req.on('data', (chunk) => {
          data += chunk
        })

        req.on('end', () => {
          bodies.push(JSON.parse(data || '{}'))
          res.writeHead(200)
          res.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server.listen(48000 + Math.floor(Math.random() * 1000), '127.0.0.1', resolve),
      )

      const port = (server.address() as { port: number }).port
      const env = envOf(`http://127.0.0.1:${port}/`)

      await db.insert(outbox).values(rowOf('ntfy'))

      const result = await drainOutbox(db, env)

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

      const drained = onlyRow(await drainedWithState('SENT'), 'outbox row')

      expect(drained.attempts).toBe(1)

      const events = await eventsOf()

      expect(events.map((event) => event.type)).toContain('created')
      const sentEvent = events.find((event) => event.type === 'notification_sent')

      expect(sentEvent).toBeDefined()
      expect(sentEvent?.actorKind).toBe('system')
      expect(sentEvent?.payload).toEqual({ channel: 'ntfy', ticketNo, attempts: 1 })

      // The JSON body publishes to the server root with the topic in the body;
      // an empty PWA URL omits the invalid empty `view` action.
      expect(bodies).toHaveLength(1)
      const body = bodies[0] as { topic: string; actions?: unknown }

      expect(body.topic).toBe('outbox-test')
      expect(body.actions).toBeUndefined()

      server.close()
    })

    it('publishes to the per-user topic carried by the row target', async () => {
      const bodies: unknown[] = []

      const server = http.createServer((req, res) => {
        let data = ''

        req.on('data', (chunk) => {
          data += chunk
        })

        req.on('end', () => {
          bodies.push(JSON.parse(data || '{}'))
          res.writeHead(200)
          res.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server.listen(48000 + Math.floor(Math.random() * 1000), '127.0.0.1', resolve),
      )

      const port = (server.address() as { port: number }).port
      const env = envOf(`http://127.0.0.1:${port}/`)

      await db.insert(outbox).values({
        ticketId,
        channel: 'ntfy',
        target: {
          ticketNo,
          priority: 'normal',
          objectName: 'Rathaus',
          ntfyTopic: 'stoerdesk-user-1',
        },
      })

      const result = await drainOutbox(db, env)

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

      expect(bodies).toHaveLength(1)
      expect((bodies[0] as { topic: string }).topic).toBe('stoerdesk-user-1')

      server.close()
    })

    it('fails a row immediately when its channel is no longer configured', async () => {
      const env = envOf('http://127.0.0.1:1/')

      await db.insert(outbox).values(rowOf('telegram'))

      const result = await drainOutbox(db, env)

      expect(result).toEqual({ sent: 0, failed: 1, fallback: 0, attempts: 1 })

      const drained = await drainedWithState('FAILED')

      expect(drained).toHaveLength(2) // previous test left a FAILED row
      const retried = onlyRow(
        drained.filter((row) => row.attempts === 1),
        'retried row',
      )

      expect(retried.state).toBe('FAILED')

      const events = await eventsOf()
      const failedEvent = events.find(
        (event) =>
          event.type === 'notification_failed' &&
          (event.payload as { channel?: string })?.channel === 'telegram',
      )

      expect(failedEvent).toBeDefined()
      expect(failedEvent?.payload).toEqual({ channel: 'telegram', ticketNo, attempts: 1, errorCode: 'channel_unconfigured' })
    })

    it('escalates an exhausted row to the next channel of the chain', async () => {
      const bodies: unknown[] = []

      const server = http.createServer((req, res) => {
        let data = ''

        req.on('data', (chunk) => {
          data += chunk
        })

        req.on('end', () => {
          bodies.push(JSON.parse(data || '{}'))
          res.writeHead(200)
          res.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server.listen(48000 + Math.floor(Math.random() * 1000), '127.0.0.1', resolve),
      )

      const port = (server.address() as { port: number }).port

      const env = loadEnv({
        SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
        SIGNAL_SOURCE_NUMBER: '+491234567890',
        SIGNAL_RECIPIENTS: '+491234567891',
        MATRIX_HOMESERVER: `http://127.0.0.1:${port}`,
        MATRIX_ROOM_ID: '!outbox-test:mock',
        MATRIX_ACCESS_TOKEN: 'outbox-test-token',
      })

      await db.insert(outbox).values(rowOf('signal'))

      const result = await drainOutbox(db, env)

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 1, attempts: 4 })

      const rows = await db
        .select({
          channel: outbox.channel,
          state: outbox.state,
          attempts: outbox.attempts,
        })
        .from(outbox)
        .where(eq(outbox.ticketId, ticketId))

      const signalRow = onlyRow(rows.filter((row) => row.channel === 'signal'), 'signal row')

      expect(signalRow.state).toBe('FAILED')
      expect(signalRow.attempts).toBe(3)

      const matrixRow = onlyRow(rows.filter((row) => row.channel === 'matrix'), 'matrix row')

      expect(matrixRow.state).toBe('SENT')
      expect(matrixRow.attempts).toBe(1)

      const events = await eventsOf()

      expect(events.map((event) => event.type)).toContain('created')

      const failedEvent = events.find(
        (event) =>
          event.type === 'notification_failed' &&
          (event.payload as { channel?: string })?.channel === 'signal',
      )

      expect(failedEvent?.payload).toEqual({ channel: 'signal', ticketNo, attempts: 3, errorCode: 'send_failed' })

      const sentEvent = events.find(
        (event) =>
          event.type === 'notification_sent' &&
          (event.payload as { channel?: string })?.channel === 'matrix',
      )

      expect(sentEvent?.payload).toEqual({ channel: 'matrix', ticketNo, attempts: 1 })

      // The fallback send really reached the Matrix homeserver mock.
      expect(bodies).toHaveLength(1)
      const body = bodies[0] as { msgtype?: string }

      expect(body.msgtype).toBe('m.text')

      server.close()
    })

    it('records the personal message of a delivery and follows its state (WP-M14-120b)', async () => {
      const env = envOf('http://127.0.0.1:1/')

      const [user] = await db
        .insert(users)
        .values({ email: 'inbox-user@example.org', passwordHash: 'no-login-for-inbox-user' })
        .returning({ id: users.id })

      const written = await enqueuePersonalDeliveries(db, [
        {
          userId: user!.id,
          channel: 'ntfy',
          eventType: 'ticket.created',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus', ntfyTopic: 'inbox-topic' },
        },
      ])

      expect(written).toBe(1)

      const message = onlyRow(
        await db
          .select({
            id: notificationMessages.id,
            state: notificationMessages.state,
            userId: notificationMessages.userId,
            channel: notificationMessages.channel,
            title: notificationMessages.title,
          })
          .from(notificationMessages),
        'notification message',
      )

      expect(message.state).toBe('PENDING')
      expect(message.userId).toBe(user!.id)
      expect(message.channel).toBe('ntfy')
      expect(message.title).toBe(ticketNo)

      const row = onlyRow(
        await db
          .select({ id: outbox.id, notificationMessageId: outbox.notificationMessageId })
          .from(outbox)
          .where(eq(outbox.notificationMessageId, message.id)),
        'outbox row',
      )

      expect(row.notificationMessageId).toBe(message.id)

      await drainOutbox(db, env)

      const after = onlyRow(
        await db
          .select({ state: notificationMessages.state })
          .from(notificationMessages),
        'notification message',
      )

      expect(after.state).toBe('FAILED')
    })

    it('names the rule, the stage, the target and the recipient of a fired escalation (WP-M14-152a)', async () => {
      const env = envOf('http://127.0.0.1:1/')

      const [user] = await db
        .insert(users)
        .values({
          email: 'escalation-user@example.invalid',
          givenName: 'Erik',
          familyName: 'Escalation',
          passwordHash: 'no-login-for-escalation-user',
        })
        .returning({ id: users.id })

      await enqueuePersonalDeliveries(db, [
        {
          userId: user!.id,
          channel: 'ntfy',
          eventType: 'ticket.escalated',
          title: ticketNo,
          body: 'normal · Rathaus · review#1 · review',
          ticketId,
          target: {
            ticketNo,
            priority: 'normal',
            objectName: 'Rathaus',
            escalationRule: 'review#1',
            escalationStage: 'review',
            targetName: 'SiTec',
            ntfyTopic: 'escalation-topic',
          },
        },
      ])

      await drainOutbox(db, env)

      const events = await db
        .select({ type: ticketEvents.type, payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

      const named = events.filter(
        (event) => (event.payload as Record<string, unknown>).rule === 'review#1',
      )

      expect(named).toHaveLength(1)
      expect(named[0]!.type).toBe('notification_failed')
      expect((named[0]!.payload as Record<string, unknown>).stage).toBe('review')
      expect((named[0]!.payload as Record<string, unknown>).target).toBe('SiTec')
      expect((named[0]!.payload as Record<string, unknown>).recipient).toBe('Erik Escalation')

      const untargeted = events.filter(
        (event) =>
          event.type === 'notification_sent' || event.type === 'notification_failed',
      )

      expect(
        untargeted.filter(
          (event) => (event.payload as Record<string, unknown>).rule === undefined,
        ).length,
      ).toBeGreaterThan(0)
    })
  },
)
