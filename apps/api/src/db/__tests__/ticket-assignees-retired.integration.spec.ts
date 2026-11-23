import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

/**
 * The retirement of the multi-technician table (`specs/07-escalation.md`
 * §7.14, ADR-0039, WP-M19-08): the migration copies the technician of the
 * latest row into `tickets.assigned_user_id` and drops the table — also on a
 * database that still holds the rows of the former model.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket assignees retirement integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, users } = schema

const migrationFile = fileURLToPath(
  new URL('../migrations/0058_drop_ticket_assignees.sql', import.meta.url),
)

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the retirement of the multi-technician table (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('copies the technician of the latest row and drops the table', async () => {
      const inserted = await db
        .insert(users)
        .values([
          { email: `retired-a-${randomUUID()}@example.invalid`, passwordHash: 'unused' },
          { email: `retired-b-${randomUUID()}@example.invalid`, passwordHash: 'unused' },
        ])
        .returning({ id: users.id })
      const firstUserId = onlyRow(inserted.slice(0, 1), 'first user').id
      const secondUserId = onlyRow(inserted.slice(1, 2), 'second user').id

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `R-${randomUUID().slice(0, 6)}`, name: 'Retirement probe' })
        .returning({ id: objects.id })

      const now = new Date()
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'ASSIGNED',
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        })
        .returning({ id: tickets.id })

      const ticketId = ticket?.id ?? ''

      // The table of the former model — the migration runs on a database that
      // still holds its rows.
      await client.unsafe(
        `create table "ticket_assignees" (
          "ticket_id" uuid not null,
          "user_id" uuid not null,
          "assigned_at" timestamp with time zone default now() not null,
          primary key ("ticket_id", "user_id")
        )`,
      )
      await client`insert into "ticket_assignees" ("ticket_id", "user_id", "assigned_at") values (
        ${ticketId}, ${firstUserId}, now() - interval '1 hour'
      ), (${ticketId}, ${secondUserId}, now())`

      const sql = readFileSync(migrationFile, 'utf8')

      for (const statement of sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()

        if (trimmed !== '') {
          await client.unsafe(trimmed)
        }
      }

      const [row] = await db
        .select({ assignedUserId: tickets.assignedUserId })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1)

      expect(row?.assignedUserId).toBe(secondUserId)

      const tables = await client<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public' and table_name = 'ticket_assignees'`

      expect(tables).toHaveLength(0)
    })
  },
)
