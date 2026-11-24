import { randomUUID } from 'node:crypto'
import http from 'node:http'

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
import { notifyAssignee } from '../assignment'
import { drainOutbox } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped phase-24 exit criterion: ${testDatabase.reason}\n`)
}

const { notificationAccounts, objects, roles, tickets, userRoles, users } = schema

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'phase-24 exit criterion — the user owns the channels, the administration names the reach (WP-M24-19)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const bodies: Array<Record<string, unknown>> = []
    let server: http.Server | undefined
    let port = 0
    let objectId = ''
    let adminCookie = ''
    let readyUserId = ''
    let bareUserId = ''

    beforeAll(async () => {
      server = http.createServer((request, reply) => {
        let data = ''

        request.on('data', (chunk) => {
          data += chunk
        })

        request.on('end', () => {
          bodies.push(JSON.parse(data || '{}'))
          reply.writeHead(200)
          reply.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server!.listen(49600 + Math.floor(Math.random() * 300), '127.0.0.1', resolve),
      )

      port = (server!.address() as { port: number }).port

      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [roleAdmin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))

      const [admin] = await db
        .insert(users)
        .values({
          email: `exit24-admin-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      const [ready] = await db
        .insert(users)
        .values({
          email: `exit24-ready-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
          givenName: 'Rita',
          familyName: 'Bereit',
        })
        .returning({ id: users.id })

      const [bare] = await db
        .insert(users)
        .values({
          email: `exit24-bare-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
          givenName: 'Bernd',
          familyName: 'Ohne',
        })
        .returning({ id: users.id })

      readyUserId = ready?.id ?? ''
      bareUserId = bare?.id ?? ''

      if (roleAdmin !== undefined && admin !== undefined) {
        await db.insert(userRoles).values({ userId: admin.id, roleId: roleAdmin.id })
      }

      const adminSession = await createSession(db, admin?.id ?? '', 1)
      adminCookie = `session=${adminSession.token}`

      // The confirmed account of the user (§11.3a): a code over the channel
      // proved that the address works.
      await db.insert(notificationAccounts).values({
        userId: readyUserId,
        channel: 'ntfy',
        externalId: `stoerdesk-${randomUUID().slice(0, 8)}`,
        verifiedAt: new Date(),
      })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `EXIT24-${randomUUID().slice(0, 6)}`, name: 'Exit probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.NTFY_URL = `http://127.0.0.1:${port}/`
      process.env.NTFY_TOPIC = 'stoerdesk-instance'
      process.env.NTFY_TOKEN = ''
      process.env.PWA_URL = ''
    })

    afterAll(async () => {
      if (server !== undefined) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
      }

      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    const env = () => loadEnv({ ...process.env })

    async function createTicket(): Promise<string> {
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

      return onlyRow(ticket === undefined ? [] : [ticket], 'exit ticket').id
    }

    it('the message goes over the confirmed channel of the recipient, to his own address', async () => {
      const ticketId = await createTicket()

      const queued = await notifyAssignee(db, { ticketId, userId: readyUserId }, env())

      expect(queued).toBe(1)

      const result = await drainOutbox(db, env())

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

      const published = bodies.at(-1) as { topic?: string }

      expect(published?.topic).toMatch(/^stoerdesk-/)
      expect(published?.topic).not.toBe('stoerdesk-instance')
    })

    it('a user without a confirmed channel is notified over the chain of the installation', async () => {
      const ticketId = await createTicket()

      const queued = await notifyAssignee(db, { ticketId, userId: bareUserId }, env())

      expect(queued).toBe(1)

      const result = await drainOutbox(db, env())

      expect(result.sent).toBe(1)

      const published = bodies.at(-1) as { topic?: string }

      expect(published?.topic).toBe('stoerdesk-instance')
    })

    it('the code over the channel confirms the account and the rule names what is missing', async () => {
      const app = await buildServer()

      try {
        // The rule of the administration: the ntfy channel must be set up.
        const put = await app.inject({
          method: 'PUT',
          url: '/api/v1/settings/notifications/channel-policy',
          headers: { cookie: adminCookie },
          payload: { requiredChannels: ['ntfy'], minimumChannelCount: 1 },
        })

        expect(put.statusCode).toBe(200)

        // The compliance of the users names the state of every channel (§11.9).
        const compliance = await app.inject({
          method: 'GET',
          url: '/api/v1/admin/notifications/compliance',
          headers: { cookie: adminCookie },
        })

        expect(compliance.statusCode).toBe(200)

        const answer = compliance.json<{
          users: Array<{
            userId: string
            compliant: boolean
            channelCount: number
            channels: Array<{ channel: string; state: string }>
          }>
        }>()

        const ready = answer.users.find((user) => user.userId === readyUserId)

        expect(ready?.channelCount).toBe(1)
        expect(ready?.channels.find((channel) => channel.channel === 'ntfy')?.state).toBe('ready')
        expect(ready?.compliant).toBe(true)

        const bare = answer.users.find((user) => user.userId === bareUserId)

        expect(bare?.compliant).toBe(false)
        expect(bare?.channels.find((channel) => channel.channel === 'ntfy')?.state).toBe('missing')

        // The code over the channel confirms the account (§11.3a).
        const verification = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/ntfy/verification',
          headers: { cookie: adminCookie },
        })

        expect(verification.statusCode).toBe(422)
      } finally {
        await app.close()
      }
    })
  },
)
