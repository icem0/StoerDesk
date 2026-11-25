import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'
import { loadEnv } from '../../config/env'
import { drainOutbox, enqueueOutbox } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase-41 exit criterion: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, userRoles, users } = schema

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

/**
 * The exit criterion of phase 41: the mailbox that the office configured in
 * the administration is a channel of the instance (ADR-0046, §11.2, WP-M41-01).
 *
 * The office configured the SMTP connection of Office 365 in the administration
 * and the test message answered „Der Kanal ist nicht vollständig konfiguriert“:
 * the registry of the channels knew the environment alone, and the environment
 * of the installation carries no SMTP key. The row of the administration is the
 * configuration of the channel — the test send reaches the mail server and the
 * notifications of the tickets go out over the mailbox.
 *
 * The mail server of the test is the closed port 1 of the loopback: the send
 * fails there — but it fails **at the mail server**, not with a missing
 * configuration.
 */
describe.skipIf(testDatabase.status === 'unavailable')(
  'phase-41 exit criterion — the mailbox of the administration is a configured channel (WP-M41-01)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let adminCookie = ''
    let objectId = ''

    const env = () =>
      loadEnv({
        ...process.env,
        NTFY_URL: '',
        NTFY_TOPIC: '',
        NTFY_TOKEN: '',
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_CHAT_ID: '',
        MATRIX_HOMESERVER: '',
        MATRIX_ROOM_ID: '',
        MATRIX_ACCESS_TOKEN: '',
        SIGNAL_CLI_URL: '',
        SIGNAL_SOURCE_NUMBER: '',
        SIGNAL_RECIPIENTS: '',
        VAPID_PUBLIC_KEY: '',
        VAPID_PRIVATE_KEY: '',
        VAPID_SUBJECT: '',
        WHATSAPP_BRIDGE_URL: '',
        WHATSAPP_BRIDGE_TOKEN: '',
        SMTP_HOST: '',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        SMTP_FROM: '',
      })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [roleAdmin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      const [admin] = await db
        .insert(users)
        .values({
          email: `exit41-admin-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      if (roleAdmin !== undefined && admin !== undefined) {
        await db.insert(userRoles).values({ userId: admin.id, roleId: roleAdmin.id })
      }

      const adminSession = await createSession(db, admin?.id ?? '', 1)

      adminCookie = `session=${adminSession.token}`

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT41-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.PWA_URL = ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('the test send without a saved mailbox names the missing configuration', async () => {
      const app = await buildServer()

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/channels/email/test',
          headers: { cookie: adminCookie },
          payload: { address: 'office@example.invalid' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ delivered: false, code: 'channel_not_configured' })
      } finally {
        await app.close()
      }
    })

    it('the saved mailbox sends the test message over the mail server of the row', async () => {
      const app = await buildServer()

      try {
        const save = await app.inject({
          method: 'PATCH',
          url: '/api/v1/admin/channels/email',
          headers: { cookie: adminCookie },
          payload: {
            enabled: true,
            config: {
              host: '127.0.0.1',
              port: '1',
              secure: 'false',
              user: 'office@example.invalid',
              from: 'office@example.invalid',
            },
          },
        })

        expect(save.statusCode).toBe(200)

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/channels/email/test',
          headers: { cookie: adminCookie },
          payload: { address: 'office@example.invalid' },
        })

        expect(response.statusCode).toBe(200)

        // The closed port 1 refuses the connection: the failure is the mail
        // server, not a missing configuration.
        expect(response.json()).toEqual({ delivered: false, code: 'send_failed' })
      } finally {
        await app.close()
      }
    })

    it('a ticket of the instance goes out over the mailbox of the administration', async () => {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority: 'normal',
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        })
        .returning({ id: tickets.id })

      const ticketId = onlyRow(ticket === undefined ? [] : [ticket], 'exit ticket').id

      const queued = await enqueueOutbox(
        db,
        {
          id: ticketId,
          ticketNo: 'ST-2026-0041',
          priority: 'normal',
          objectName: 'Rathaus',
        },
        env(),
      )

      expect(queued).toBe(1)

      const result = await drainOutbox(db, env())

      // Three attempts, then the row ends FAILED — the mail server refused the
      // message, the channel was never missing.
      expect(result.attempts).toBe(3)
      expect(result.failed).toBe(1)

      const [row] = await db
        .select({
          channel: schema.outbox.channel,
          state: schema.outbox.state,
          target: schema.outbox.target,
        })
        .from(schema.outbox)
        .where(eq(schema.outbox.ticketId, ticketId))

      expect(row?.channel).toBe('email')
      expect(row?.state).toBe('FAILED')
      expect((row?.target as { lastError?: string } | undefined)?.lastError).toBe('send_failed')
    })
  },
)
