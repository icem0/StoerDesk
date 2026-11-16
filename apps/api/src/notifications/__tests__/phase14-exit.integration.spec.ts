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
import { writePreferences } from '../preferences'

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
    let bStoredTopic = ''

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

      bStoredTopic = onlyRow(
        await db
          .select({ externalId: notificationAccounts.externalId })
          .from(notificationAccounts)
          .where(eq(notificationAccounts.userId, userBId))
          .limit(1),
        'stored b topic',
      ).externalId

      // The selection of the user (§11.4): A and B select ntfy for `ticket.created`,
      // C selects nothing.
      await writePreferences(db, userAId, [{ eventType: 'ticket.created', channel: 'ntfy' }])
      await writePreferences(db, userBId, [{ eventType: 'ticket.created', channel: 'ntfy' }])

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

    it('the selection of the user decides the channels and the account of the user is used', async () => {
      const ticket = onlyRow(await createTicket('normal'), 'selection ticket')

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: {},
      })

      const mock = openMockServer()

      try {
        const queued = await enqueueOutbox(
          db,
          { id: ticket.id, ticketNo: ticket.ticketNo, priority: 'normal', objectName: 'Exit probe' } satisfies OutboxTicket,
          envOf({ NTFY_URL: `http://127.0.0.1:${mock.port}/`, NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
        )

        const result = await drainOutbox(
          db,
          envOf({ NTFY_URL: `http://127.0.0.1:${mock.port}/`, NTFY_TOPIC: instanceTopic, NTFY_TOKEN: ntfyToken }),
        )

        expect(queued).toBe(2)
        expect(result).toEqual({ sent: 2, failed: 0, fallback: 0, attempts: 2 })

        const topics = (await rowsFor(ticket.id)).map(
          (row) => (row.target as Record<string, unknown>).ntfyTopic,
        )

        // The selection of A and B replaced the instance topic with one row each;
        // both send to the stored topic of the account of the user (WP-M14-72:
        // a user without an account receives no ntfy row), and C — without
        // a selection — never receives a row.
        expect(new Set(topics)).toEqual(new Set([accountTopic, bStoredTopic]))
        expect(topics).not.toContain(instanceTopic)
        expect(topics).not.toContain(`stoerdesk-${userAId}`)
        expect(bStoredTopic).toMatch(/^stoerdesk-[0-9a-f]{32}$/)

        // The send really published to the two per-user topics of the account.
        const published = mock.requests.flatMap((request) => request.bodies.map((body) => (body as { topic?: string }).topic))
        expect(new Set(published)).toEqual(new Set([accountTopic, bStoredTopic]))
        expect(mock.requests).toHaveLength(2)
      } finally {
        mock.close()
      }
    })

    it('the mandatory minimum channels of a critical ticket are queued whatever the selection says', async () => {
      const put = await app!.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications/minimum-channels',
        headers: { cookie: sessionCookie },
        payload: { channels: ['matrix'] },
      })

      expect(put.statusCode).toBe(200)

      const normalTicket = onlyRow(await createTicket('normal'), 'normal ticket')
      const criticalTicket = onlyRow(await createTicket('critical'), 'critical ticket')

      const ntfyOnly = envOf({
        NTFY_URL: `http://127.0.0.1:1/`,
        NTFY_TOPIC: instanceTopic,
        NTFY_TOKEN: ntfyToken,
      })

      const normalQueued = await enqueueOutbox(
        db,
        { id: normalTicket.id, ticketNo: normalTicket.ticketNo, priority: 'normal', objectName: 'Exit probe' } satisfies OutboxTicket,
        ntfyOnly,
      )

      const criticalQueued = await enqueueOutbox(
        db,
        { id: criticalTicket.id, ticketNo: criticalTicket.ticketNo, priority: 'critical', objectName: 'Exit probe' } satisfies OutboxTicket,
        ntfyOnly,
      )

      const normalChannels = (await rowsFor(normalTicket.id)).map((row) => row.channel)
      const criticalChannels = (await rowsFor(criticalTicket.id)).map((row) => row.channel)

      expect(normalQueued).toBe(2)
      expect(criticalQueued).toBe(3)

      // A normal ticket keeps only the selection of the user (ntfy, the per-user
      // rows); the critical ticket additionally carries the mandatory minimum
      // channel — once, never a duplicate — whatever the selection says.
      expect(normalChannels.filter((channel) => channel === 'matrix')).toHaveLength(0)
      expect(criticalChannels.filter((channel) => channel === 'matrix')).toHaveLength(1)

      const mock = openMockServer()

      try {
        const drainEnv = envOf({
          NTFY_URL: `http://127.0.0.1:${mock.port}/`,
          NTFY_TOPIC: instanceTopic,
          NTFY_TOKEN: ntfyToken,
          MATRIX_HOMESERVER: `http://127.0.0.1:${mock.port}`,
          MATRIX_ROOM_ID: '!exit:mock',
          MATRIX_ACCESS_TOKEN: matrixToken,
        })

        await drainOutbox(db, drainEnv)

        expect((await rowsFor(normalTicket.id)).every((row) => row.state === 'SENT')).toBe(true)
        expect((await rowsFor(criticalTicket.id)).every((row) => row.state === 'SENT')).toBe(true)
      } finally {
        mock.close()
      }
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
        expect(failed[0]?.payload).toEqual({ channel: 'signal', ticketNo: ticket.ticketNo, attempts: 3 })
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
