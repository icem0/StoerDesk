import http from 'node:http'
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { createSession } from '../../auth/session'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped confirmation integration: ${testDatabase.reason}\n`)
}

const { notificationAccounts, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the confirmation of a channel of a user (WP-M24-08, §11.3a)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const bodies: Array<Record<string, unknown>> = []
    let server: http.Server | undefined
    let port = 0
    let userId = ''
    let cookie = ''

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
        server!.listen(49500 + Math.floor(Math.random() * 500), '127.0.0.1', resolve),
      )

      port = (server!.address() as { port: number }).port

      await migrate(db, { migrationsFolder })

      const [user] = await db
        .insert(users)
        .values({
          email: `confirm-${randomUUID().slice(0, 8)}@example.invalid`,
          passwordHash: 'not-a-real-hash',
        })
        .returning({ id: users.id })

      userId = user?.id ?? ''

      await db.insert(notificationAccounts).values({
        userId,
        channel: 'ntfy',
        externalId: `stoerdesk-${randomUUID().slice(0, 8)}`,
      })

      const session = await createSession(db, userId, 1)
      cookie = `session=${session.token}`

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.NTFY_URL = `http://127.0.0.1:${port}/`
      process.env.NTFY_TOPIC = 'stoerdesk-instance'
      process.env.NTFY_TOKEN = ''
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

    async function build() {
      return await buildServer()
    }

    it('sends the code over the channel of the account and answers the deadline', async () => {
      const app = await build()

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/ntfy/verification',
          headers: { cookie },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json<{ expiresAt: string }>().expiresAt).toBeTruthy()

        // The code travelled over the channel of the user — the topic of his
        // account, not the topic of the installation.
        const published = bodies.at(-1) as { topic?: string; message?: string }

        expect(published.topic).toMatch(/^stoerdesk-/)
        expect(published.message).toMatch(/[A-Z2-9]{6}/)
      } finally {
        await app.close()
      }
    })

    it('refuses a wrong code and confirms the account with the right one', async () => {
      const app = await build()

      try {
        await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/ntfy/verification',
          headers: { cookie },
        })

        const wrong = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/ntfy/verification/confirm',
          headers: { cookie },
          payload: { code: 'ZZZZZZ' },
        })

        expect(wrong.statusCode).toBe(422)

        const published = bodies.at(-1) as { message?: string }
        const code = /([A-Z2-9]{6})/.exec(published.message ?? '')?.[1] ?? ''

        const right = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/ntfy/verification/confirm',
          headers: { cookie },
          payload: { code },
        })

        expect(right.statusCode).toBe(200)

        const [row] = await db
          .select({ verifiedAt: notificationAccounts.verifiedAt })
          .from(notificationAccounts)
          .where(eq(notificationAccounts.userId, userId))
          .limit(1)

        expect(row?.verifiedAt).toBeTruthy()

        // The account is now a channel of the user (§11.3a).
        const accounts = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications/accounts',
          headers: { cookie },
        })

        const answer = accounts.json<{ accounts: Array<{ channel: string; state: string }> }>()

        expect(answer.accounts.find((account) => account.channel === 'ntfy')?.state).toBe('ready')
      } finally {
        await app.close()
      }
    })

    it('refuses the confirmation of a channel without an account', async () => {
      const app = await build()

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/notifications/accounts/telegram/verification',
          headers: { cookie },
        })

        expect(response.statusCode).toBe(422)
      } finally {
        await app.close()
      }
    })
  },
)
