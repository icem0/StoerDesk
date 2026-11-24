import { randomUUID } from 'node:crypto'
import http from 'node:http'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance } from 'fastify'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { hashPassword } from '../../auth/password'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import { enqueueOutbox, drainOutbox, type OutboxTicket } from '../outbox'
import { storeAccount } from '../accounts'
import { notifyAssignee } from '../assignment'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase-14 exit criterion: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, ticketEvents, userRoles, users, outbox, notificationAccounts } = schema

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

type CookieHeaders = { headers: IncomingHttpHeaders | OutgoingHttpHeaders }

function setCookieHeaders(response: CookieHeaders): string[] {
  const raw = (response.headers as Record<string, unknown>)['set-cookie']

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry))
  }

  return typeof raw === 'string' ? [raw] : []
}

function cookiePair(response: CookieHeaders, name: string): string | undefined {
  for (const entry of setCookieHeaders(response)) {
    const [pair] = entry.split(';')

    if (pair !== undefined && pair.startsWith(`${name}=`)) {
      return pair
    }
  }

  return undefined
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase-14 exit criterion — selection decides the channels, the account of the user is used, the minimum channels of a critical ticket, the warning on a failed channel (WP-M14-21)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const ntfyToken = 'ntfy-secret-token-xyz'
    const matrixToken = 'matrix-secret-token-abc'
    const instanceTopic = 'instance-topic'
    const accountTopic = 'a-custom-topic'

    // Every channel key off — each test turns exactly the channels it needs on.
    // The base is the raw environment so `loadEnv` re-parses strings, not the
    // already-parsed booleans of `Env`.
    const base = { ...process.env }
    const channelsOff = {
      NTFY_URL: '',
      NTFY_TOPIC: '',
      NTFY_TOKEN: '',
      PWA_URL: '',
      MATRIX_HOMESERVER: '',
      MATRIX_ROOM_ID: '',
      MATRIX_ACCESS_TOKEN: '',
      SIGNAL_CLI_URL: '',
      SIGNAL_SOURCE_NUMBER: '',
      SIGNAL_RECIPIENTS: '',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
      SMTP_HOST: '',
      SMTP_FROM: '',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
      WHATSAPP_BRIDGE_URL: '',
      WHATSAPP_BRIDGE_TOKEN: '',
    } satisfies Record<string, string>

    const envOf = (overrides: Record<string, string>): Env =>
      loadEnv({ ...base, ...channelsOff, ...overrides })

    let app: FastifyInstance | undefined = undefined
    let sessionCookie = ''
    let userAId = ''
    let userBId = ''
    let userCId = ''
    let objectId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [roleAdmin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      if (roleAdmin === undefined) {
        throw new Error('expected the seeded admin role')
      }

      const inserted = await db
        .insert(users)
        .values([
          { email: 'exit-a@example.de', passwordHash: await hashPassword('a-login-password-1234') },
          { email: 'exit-b@example.de', passwordHash: 'not-used' },
          { email: 'exit-c@example.de', passwordHash: 'not-used' },
        ])
        .returning({ id: users.id })

      userAId = inserted[0]?.id ?? ''
      userBId = inserted[1]?.id ?? ''
      userCId = inserted[2]?.id ?? ''

      if (userAId === '' || userBId === '' || userCId === '') {
        throw new Error('expected three exit users')
      }

      await db.insert(userRoles).values({ userId: userAId, roleId: roleAdmin.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      if (objectId === '') {
        throw new Error('expected one exit object')
      }

      // The account of the user (§11.3): the ntfy topic of a user is the stored
      // `external_id` of the account (WP-M14-72 — A keeps the account topic, B
      // gets a random topic the server creates).
      await storeAccount(db, userAId, {
        channel: 'ntfy',
        externalId: accountTopic,
        label: 'A topic',
      })
      await storeAccount(db, userBId, {
        channel: 'ntfy',
        externalId: '',
        label: 'B topic',
      })

      // The accounts of A and B are confirmed (§11.3a, ADR-0045): a code over
      // the channel proved that the address works. C has no account at all.
      await db.execute(
        `update "notification_accounts" set "verified_at" = now() where "user_id" in ('${userAId}', '${userBId}')`,
      )

      process.env.DATABASE_URL = url
      process.env.API_LOG_LEVEL = 'silent'
      process.env.MATRIX_HOMESERVER = 'https://matrix.exit.invalid'
      process.env.MATRIX_ROOM_ID = '!exit:mock'
      process.env.MATRIX_ACCESS_TOKEN = matrixToken

      app = await buildServer()
      sessionCookie = await login()
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

    async function login(): Promise<string> {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'exit-a@example.de', password: 'a-login-password-1234' },
      })

      const pair = cookiePair(response, 'session')

      if (pair === undefined) {
        throw new Error('login did not set a session cookie')
      }

      return pair
    }

    const createTicket = (priority: string) =>
      db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority,
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

    const rowsFor = async (ticketId: string) =>
      await db
        .select({
          channel: outbox.channel,
          state: outbox.state,
          attempts: outbox.attempts,
          target: outbox.target,
        })
        .from(outbox)
        .where(eq(outbox.ticketId, ticketId))

    const eventsFor = async (ticketId: string) =>
      await db
        .select({
          type: ticketEvents.type,
          actorKind: ticketEvents.actorKind,
          payload: ticketEvents.payload,
        })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, ticketId))

    const openMockServer = (): { port: number; requests: { path: string; authorization: string; bodies: unknown[] }[]; close: () => void } => {
      const requests: { path: string; authorization: string; bodies: unknown[] }[] = []
      const server = http.createServer((request, reply) => {
        let data = ''

        request.on('data', (chunk) => {
          data += chunk
        })

        request.on('end', () => {
          requests.push({
            path: request.url ?? '',
            authorization: String(request.headers.authorization ?? ''),
            bodies: [JSON.parse(data || '{}')],
          })
          reply.writeHead(200)
          reply.end('ok')
        })
      })

      const port = 48000 + Math.floor(Math.random() * 1000)

      server.listen(port, '127.0.0.1')

      return { port, requests, close: () => server.close() }
    }

    it('the confirmed channels of the user carry the message to his own address', async () => {
      const ticket = onlyRow(await createTicket('normal'), 'assignment ticket')

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      const mock = openMockServer()

      try {
        // The assignment names the technician — the recipient decides the way:
        // the message goes over his confirmed channels, to his own address
        // (ADR-0045).
        const queued = await notifyAssignee(db, { ticketId: ticket.id, userId: userAId })

        expect(queued).toBe(1)

        const result = await drainOutbox(
          db,
          envOf({ NTFY_URL: `http://127.0.0.1:${mock.port}/`, NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
        )

        expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

        const topics = (await rowsFor(ticket.id)).map(
          (row) => (row.target as Record<string, unknown>).ntfyTopic,
        )

        expect(topics).toEqual([accountTopic])
        expect(topics).not.toContain(instanceTopic)

        // The send really published to the topic of the account of the user.
        const published = mock.requests.flatMap((request) =>
          request.bodies.map((body) => (body as { topic?: string }).topic),
        )

        expect(new Set(published)).toEqual(new Set([accountTopic]))
        expect(mock.requests).toHaveLength(1)
      } finally {
        mock.close()
      }
    })

    it('a user without a confirmed channel is notified over the chain of the installation', async () => {
      const ticket = onlyRow(await createTicket('normal'), 'fallback ticket of the chain')

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      const mock = openMockServer()

      try {
        const queued = await notifyAssignee(
          db,
          { ticketId: ticket.id, userId: userCId },
          envOf({ NTFY_URL: `http://127.0.0.1:${mock.port}/`, NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
        )

        expect(queued).toBe(1)

        const result = await drainOutbox(
          db,
          envOf({ NTFY_URL: `http://127.0.0.1:${mock.port}/`, NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
        )

        expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

        const published = mock.requests.flatMap((request) =>
          request.bodies.map((body) => (body as { topic?: string }).topic),
        )

        expect(new Set(published)).toEqual(new Set([instanceTopic]))
      } finally {
        mock.close()
      }
    })

    it('the rule of the administration does not decide the way of a message', async () => {
      const put = await app!.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/channel-policy',
        headers: { cookie: sessionCookie },
        payload: { requiredChannels: ['ntfy'], minimumChannelCount: 2 },
      })

      expect(put.statusCode).toBe(200)

      const ticket = onlyRow(await createTicket('critical'), 'policy ticket')

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      const queued = await enqueueOutbox(
        db,
        { id: ticket.id, ticketNo: ticket.ticketNo, priority: 'critical', objectName: 'Exit probe' } satisfies OutboxTicket,
        envOf({ NTFY_URL: 'http://127.0.0.1:1/', NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
      )

      // The rule says what a user must have set up (§11.9); it never adds a
      // channel to a message.
      expect(queued).toBe(1)

      const channels = (await rowsFor(ticket.id)).map((row) => row.channel)

      expect(channels).toEqual(['ntfy'])

      // The row of this probe must not disturb the drains of the other probes.
      await db.delete(outbox).where(eq(outbox.ticketId, ticket.id))
    })

    it('a failed channel is visible in the status and the chain continues with the next channel', async () => {
      const ticket = onlyRow(await createTicket('normal'), 'fallback ticket')

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      const signalOnly = envOf({
        SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
        SIGNAL_SOURCE_NUMBER: '+491234567890',
        SIGNAL_RECIPIENTS: '+491234567891',
      })

      const queued = await enqueueOutbox(
        db,
        { id: ticket.id, ticketNo: ticket.ticketNo, priority: 'normal', objectName: 'Exit probe' } satisfies OutboxTicket,
        signalOnly,
      )

      expect(queued).toBe(1)

      const mock = openMockServer()

      try {
        const fallbackEnv = envOf({
          SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
          SIGNAL_SOURCE_NUMBER: '+491234567890',
          SIGNAL_RECIPIENTS: '+491234567891',
          MATRIX_HOMESERVER: `http://127.0.0.1:${mock.port}`,
          MATRIX_ROOM_ID: '!exit:mock',
          MATRIX_ACCESS_TOKEN: matrixToken,
        })

        const result = await drainOutbox(db, fallbackEnv)
        expect(result).toEqual({ sent: 1, failed: 0, fallback: 1, attempts: 4 })

        const rows = await rowsFor(ticket.id)
        const signalRow = onlyRow(rows.filter((row) => row.channel === 'signal'), 'signal row')
        const matrixRow = onlyRow(rows.filter((row) => row.channel === 'matrix'), 'matrix row')

        expect(signalRow.state).toBe('FAILED')
        expect(signalRow.attempts).toBe(3)
        expect(matrixRow.state).toBe('SENT')
        expect(matrixRow.attempts).toBe(1)

        // The fallback really reached the next channel of the chain.
        expect(mock.requests).toHaveLength(1)
        const published = mock.requests.flatMap((request) => request.bodies)
        const fallbackBody = onlyRow(published, 'matrix body')
        expect((fallbackBody as { msgtype?: string }).msgtype).toBe('m.text')

        const status = await app!.inject({
          method: 'GET',
          url: '/api/v1/notifications/status',
          headers: { cookie: sessionCookie },
        })

        expect(status.statusCode).toBe(200)

        const channels = status.json<Record<string, unknown>>().channels as Array<Record<string, unknown>>
        const signalStatus = onlyRow(channels.filter((entry) => entry.name === 'signal'), 'signal status')
        const matrixStatus = onlyRow(channels.filter((entry) => entry.name === 'matrix'), 'matrix status')

        expect(signalStatus.failed).toBeGreaterThanOrEqual(1)
        expect(signalStatus.pending).toBe(0)
        expect(signalStatus.lastFailedAt).toBeTruthy()
        expect(matrixStatus.lastSentAt).toBeTruthy()

        const events = await eventsFor(ticket.id)
        const failed = events.filter(
          (event) =>
            event.type === 'notification_failed' &&
            (event.payload as Record<string, unknown>).channel === 'signal',
        )
        const sent = events.filter(
          (event) =>
            event.type === 'notification_sent' &&
            (event.payload as Record<string, unknown>).channel === 'matrix',
        )

        expect(failed).toHaveLength(1)
        expect(failed[0]?.payload).toEqual({ channel: 'signal', ticketNo: ticket.ticketNo, attempts: 3, errorCode: 'send_failed' })
        expect(sent).toHaveLength(1)
        expect(sent[0]?.payload).toEqual({ channel: 'matrix', ticketNo: ticket.ticketNo, attempts: 1 })
      } finally {
        mock.close()
      }
    })

    it('the secrets of a channel and of an account never reach an answer, a log or an event payload', async () => {
      const ticket = onlyRow(await createTicket('normal'), 'secret ticket')

      const mock = openMockServer()

      try {
        const env = envOf({
          NTFY_URL: `http://127.0.0.1:${mock.port}/`,
          NTFY_TOPIC: instanceTopic,
          NTFY_TOKEN: ntfyToken,
        })

        await enqueueOutbox(
          db,
          { id: ticket.id, ticketNo: ticket.ticketNo, priority: 'normal', objectName: 'Exit probe' } satisfies OutboxTicket,
          env,
        )
        await drainOutbox(db, env)

        // The ntfy access token (the write-only secret of the channel, ADR-0022)
        // travels only in the `Authorization` header — never in the URL, never in
        // the JSON body.
        for (const request of mock.requests) {
          expect(request.authorization).toBe(`Bearer ${ntfyToken}`)
          expect(JSON.stringify({ path: request.path, bodies: request.bodies }).includes(ntfyToken)).toBe(false)
        }

        const secrets = [ntfyToken, matrixToken]

        const status = await app!.inject({
          method: 'GET',
          url: '/api/v1/notifications/status',
          headers: { cookie: sessionCookie },
        })
        expect(status.statusCode).toBe(200)
        expect(secrets.some((secret) => JSON.stringify(status.json()).includes(secret))).toBe(false)

        for (const event of await eventsFor(ticket.id)) {
          expect(secrets.some((secret) => JSON.stringify(event.payload).includes(secret))).toBe(false)
        }

        const accounts = await db
          .select({ externalId: notificationAccounts.externalId })
          .from(notificationAccounts)

        expect(accounts.some((row) => row.externalId === accountTopic)).toBe(true)
      } finally {
        mock.close()
      }
    })
  },
)
