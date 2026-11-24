import http from 'node:http'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { loadEnv, type Env } from '../../config/env'
import { drainOutbox, enqueueOncallOutbox, type OutboxShift } from '../outbox'

const onlyRow = <T>(rows: T[], what: string): T => {
  const [row] = rows

  if (row === undefined) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped readiness outbox integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'readiness outbox drain (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let poolId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const poolRows = await client<{ id: string }[]>`
        insert into "oncall_pools" ("name", "active")
        values (${`Readiness pool ${crypto.randomUUID().slice(2, 8)}`}, true)
        returning "id"`

      poolId = onlyRow(poolRows, 'pool').id
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    const envOf = (port: number, pwaUrl: string): Env =>
      loadEnv({
        PWA_URL: pwaUrl,
        NTFY_URL: `http://127.0.0.1:${port}/`,
        NTFY_TOPIC: 'readiness-test',
      })

    let shiftStartSeconds = 30

    const insertShift = async (state = 'PLANNED'): Promise<string> => {
      const seconds = String(shiftStartSeconds % 60).padStart(2, '0')
      shiftStartSeconds += 1

      const rows = await client<{ id: string }[]>`
        insert into "oncall_shifts" ("pool_id", "state", "starts_at", "ends_at")
        values (${poolId}, ${state}, ${`2026-03-23T06:00:${seconds}Z`}, ${`2026-03-30T05:00:${seconds}Z`})
        returning "id"`

      return onlyRow(rows, 'shift').id
    }

    const insertUser = async (suffix: string): Promise<string> => {
      const rows = await client<{ id: string }[]>`
        insert into "users" ("email", "password_hash", "given_name", "family_name")
        values (${`readiness-${suffix}@example.invalid`}, 'x', 'Readiness', 'User')
        returning "id"`

      return onlyRow(rows, 'user').id
    }

    const shiftOf = async (id: string): Promise<OutboxShift> => {
      const rows = await client<{
        id: string
        pool_id: string
        state: string
        starts_at: Date
        ends_at: Date
      }[]>`
        select "id", "pool_id", "state", "starts_at", "ends_at"
        from "oncall_shifts"
        where "id" = ${id}`

      const shift = onlyRow(rows, 'shift')

      return {
        id: shift.id,
        poolId: shift.pool_id,
        state: shift.state,
        startsAt: new Date(shift.starts_at),
        endsAt: new Date(shift.ends_at),
      }
    }

    const serverBodies: unknown[] = []
    let server: http.Server | undefined
    let port = 0

    beforeEach(async () => {
      serverBodies.length = 0

      if (server !== undefined) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
        server = undefined
      }

      server = http.createServer((req, res) => {
        let data = ''

        req.on('data', (chunk) => {
          data += chunk
        })

        req.on('end', () => {
          serverBodies.push(JSON.parse(data || '{}'))
          res.writeHead(200)
          res.end('ok')
        })
      })

      await new Promise<void>((resolve) =>
        server!.listen(49000 + Math.floor(Math.random() * 1000), '127.0.0.1', resolve),
      )

      port = (server!.address() as { port: number }).port
    })

    afterEach(async () => {
      await db.delete(schema.outbox)

      if (server !== undefined) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
        server = undefined
      }
    })

    const env = (pwaUrl = ''): Env => envOf(port, pwaUrl)

    it('queues the readiness fields and never the ticket fields', async () => {
      const shiftId = await insertShift()
      const userId = await insertUser('no-selection')

      const count = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )

      expect(count).toBe(1)

      const row = onlyRow(
        await db
          .select({
            ticketId: schema.outbox.ticketId,
            shiftId: schema.outbox.shiftId,
            eventType: schema.outbox.eventType,
            channel: schema.outbox.channel,
            target: schema.outbox.target,
          })
          .from(schema.outbox)
          .where(eq(schema.outbox.shiftId, shiftId)),
        'readiness row',
      )

      expect(row.ticketId).toBeNull()
      expect(row.shiftId).toBe(shiftId)
      expect(row.eventType).toBe('oncall.assigned')
      expect(row.channel).toBe('ntfy')
      const target = row.target as Record<string, unknown>

      expect(String(target.poolName)).toMatch(/^Readiness pool/)
      expect(target.state).toBe('PLANNED')
      expect(target.shiftId).toBe(shiftId)
      expect(row.target).not.toHaveProperty('ticketNo')
      expect(row.target).not.toHaveProperty('priority')
      expect(row.target).not.toHaveProperty('objectName')
    })

    it('drains the confirmed channel of the technician once through that channel', async () => {
      const shiftId = await insertShift('PLANNED')
      const userId = await insertUser('confirmed')
      const topic = `custom-topic-${crypto.randomUUID().slice(2, 8)}`

      await client`
        insert into "notification_accounts" ("user_id", "channel", "external_id", "label", "secret", "verified_at")
        values (${userId}, 'ntfy', ${topic}, 'custom', 'secret', now())
      `

      const count = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )

      expect(count).toBe(1)

      const result = await drainOutbox(db, env())

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

      expect(serverBodies).toHaveLength(1)
      const body = serverBodies[0] as { topic: string; title: string; message: string; actions?: unknown }

      expect(body.topic).toBe(topic)
      expect(body.title).toContain('Readiness pool')
      expect(body.message).toContain('PLANNED')
      expect(body.message).toContain('07:00')
      expect(body.actions).toBeUndefined()

      const drained = onlyRow(
        await db
          .select({ state: schema.outbox.state, attempts: schema.outbox.attempts })
          .from(schema.outbox)
          .where(eq(schema.outbox.shiftId, shiftId)),
        'drained readiness row',
      )

      expect(drained.state).toBe('SENT')
      expect(drained.attempts).toBe(1)
    })

    it('uses the instance chain when the technician has no confirmed channel', async () => {
      const shiftId = await insertShift('DRAFT')
      const userId = await insertUser('chain')

      const count = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )

      expect(count).toBe(1)

      const result = await drainOutbox(db, env())

      expect(result).toEqual({ sent: 1, failed: 0, fallback: 0, attempts: 1 })

      expect(serverBodies).toHaveLength(1)
      const body = serverBodies[0] as { topic: string; title: string; message: string; actions?: unknown }

      expect(body.topic).toBe('readiness-test')
      expect(body.title).toContain('Readiness pool')
      expect(body.message).toContain('DRAFT')
      expect(body.actions).toBeUndefined()
    })

    it('sends the deep link to /oncall for a readiness row', async () => {
      const shiftId = await insertShift('PLANNED')
      const userId = await insertUser('deeplink')

      await client`
        insert into "notification_accounts" ("user_id", "channel", "external_id", "label", "secret", "verified_at")
        values (${userId}, 'ntfy', ${`topic-${crypto.randomUUID().slice(2, 8)}`}, 'custom', 'secret', now())
      `

      await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env('https://pwa.example.invalid/'),
      )

      await drainOutbox(db, env('https://pwa.example.invalid/'))

      expect(serverBodies).toHaveLength(1)
      const body = serverBodies[0] as { actions?: unknown }

      expect(body.actions).toEqual([{ action: 'view', label: expect.any(String), url: 'https://pwa.example.invalid/oncall' }])
    })

    it('is a no-op for a second enqueue while the readiness row is still PENDING', async () => {
      const shiftId = await insertShift('PLANNED')
      const userId = await insertUser('idempotent')

      const first = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )
      const second = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )

      expect(first).toBe(1)
      expect(second).toBe(0)

      const rows = await db
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .where(eq(schema.outbox.shiftId, shiftId))

      expect(rows).toHaveLength(1)
    })

    it('fails a readiness row on a confirmed channel that is not configured', async () => {
      const shiftId = await insertShift('PLANNED')
      const userId = await insertUser('unconfigured')

      await client`
        insert into "notification_accounts" ("user_id", "channel", "external_id", "label", "secret", "verified_at")
        values (${userId}, 'matrix', '@alice:example.org', 'Matrix', 'token', now())
      `

      const count = await enqueueOncallOutbox(
        db,
        { shift: await shiftOf(shiftId), eventType: 'oncall.assigned', userId },
        env(),
      )

      expect(count).toBe(1)

      const result = await drainOutbox(db, env())

      expect(result).toEqual({ sent: 0, failed: 1, fallback: 0, attempts: 1 })

      const drained = onlyRow(
        await db
          .select({ state: schema.outbox.state, attempts: schema.outbox.attempts })
          .from(schema.outbox)
          .where(eq(schema.outbox.shiftId, shiftId)),
        'failed readiness row',
      )

      expect(drained.state).toBe('FAILED')
      expect(drained.attempts).toBe(1)
    })
  },
)
