import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { enqueueChannelHealthWarnings, evaluateChannelHealth } from '../health'
import { messageOf } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped channel health integration: ${testDatabase.reason}\n`)
}

const { outbox } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

let ticketId = ''

describe.skipIf(testDatabase.status === 'unavailable')(
  'the health of the notification channels (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const env = loadEnv({
      NTFY_URL: 'https://ntfy.mock',
      NTFY_TOPIC: 'office',
    })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const objectRows = await client<{ id: string }[]>`
        insert into "objects" ("object_no", "name")
        values (${`HEALTH-${randomUUID().slice(0, 6)}`}, 'Health probe')
        returning "id"`
      const object = onlyRow(objectRows, 'object')

      const ticketRows = await client<{ id: string }[]>`
        insert into "tickets" ("object_id", "reported_at", "deadline_at")
        values (${object.id}, now(), now() + interval '1 hour')
        returning "id"`

      ticketId = onlyRow(ticketRows, 'ticket').id
    }, 60_000)

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    }, 60_000)

    async function row(
      channel: string,
      state: 'SENT' | 'FAILED',
      options: { lastError?: string; createdAt?: Date } = {},
    ): Promise<void> {
      await db.insert(outbox).values({
        ticketId,
        channel,
        eventType: 'ticket.created',
        state,
        target: options.lastError === undefined ? {} : { lastError: options.lastError },
        createdAt: options.createdAt ?? new Date(),
      })
    }

    it('names a channel whose last delivery failed and none succeeded since', async () => {
      const suffix = randomUUID().slice(0, 6)
      const broken = `broken-${suffix}`
      const healthy = `healthy-${suffix}`

      await row(broken, 'FAILED', { lastError: 'push_subscription_dead' })
      await row(healthy, 'FAILED', { lastError: 'http_401' })
      await row(healthy, 'SENT')

      const health = await evaluateChannelHealth(db)
      const brokenHealth = health.find((entry) => entry.channel === broken)

      expect(brokenHealth?.code).toBe('push_subscription_dead')
      expect(health.find((entry) => entry.channel === healthy)).toBeUndefined()
    })

    it('writes one warning over another channel and none on the second day', async () => {
      const suffix = randomUUID().slice(0, 6)
      const broken = `warn-${suffix}`

      await row(broken, 'FAILED', { lastError: 'push_subscription_dead' })

      const written = await enqueueChannelHealthWarnings(db, env)

      expect(written).toBeGreaterThanOrEqual(1)

      const warnings = await db
        .select({ channel: outbox.channel, target: outbox.target })
        .from(outbox)
        .where(eq(outbox.eventType, 'channel.health_warning'))

      const warning = warnings.find((entry) => (entry.target as { channel?: string }).channel === broken)

      expect(warning?.channel).toBe('ntfy')
      expect((warning?.target as { code?: string }).code).toBe('push_subscription_dead')

      const again = await enqueueChannelHealthWarnings(db, env)

      expect(again).toBe(0)
    })

    it('builds the translated message of the warning', async () => {
      const message = messageOf({ channel: 'webpush', code: 'push_subscription_dead' }, 'channel.health_warning')

      expect(message.title).toBe('Web Push')
      expect(message.body).toContain('Web Push')
      expect(message.body).toContain('push_subscription_dead')
    })
  },
)
