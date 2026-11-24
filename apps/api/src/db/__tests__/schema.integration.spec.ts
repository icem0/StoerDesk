import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped the schema of the database: ${testDatabase.reason}\n`)
}

/** Drizzle wraps driver errors, so the Postgres error may sit in `cause`. */
async function expectPgError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const pgError = error instanceof PostgresError ? error : (error as { cause?: unknown }).cause

    expect(pgError).toBeInstanceOf(PostgresError)
    expect((pgError as PostgresError).code).toBe(code)

    return
  }

  throw new Error(`expected postgres error ${code}`)
}

/**
 * The schema of the database, proven against the database itself (WP-M28-04).
 *
 * Until WP-M28-04 the file `migrations.spec.ts` read the text of the migration
 * files and searched it for fragments of SQL: `expect(sql).toContain('CREATE
 * TABLE "tickets"')`. Such an assertion says nothing about the database — it
 * breaks when a migration is written differently and it passes when the
 * migration was never run. Every one of those assertions became an assertion
 * against the real schema here: the table exists, the constraint refuses the
 * row that breaks it, the trigger protects the row.
 */
describe.skipIf(testDatabase.status === 'unavailable')(
  'the schema of the database (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 4 })
    const db = drizzle(client)

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'unavailable') {
        return
      }

      await testDatabase.close()
    })

    async function tables(): Promise<string[]> {
      const rows = await client<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      `

      return rows.map((row) => row.table_name)
    }

    async function columnsOf(table: string): Promise<string[]> {
      const rows = await client<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = ${table}
        order by column_name
      `

      return rows.map((row) => row.column_name)
    }

    async function newUser() {
      const [row] = await client`
        insert into "users" ("email", "password_hash") values (
          ${`schema-${randomUUID()}@example.invalid`}, ${`hash-${randomUUID()}`}
        ) returning id
      `

      return String(row?.id ?? '')
    }

    async function newObject() {
      const [row] = await client`
        insert into "objects" ("object_no", "name") values (${`o-${randomUUID()}`}, 'Objekt')
        returning id
      `

      return String(row?.id ?? '')
    }

    async function newTicket(objectId: string) {
      const [row] = await client`
        insert into "tickets" ("object_id", "source", "reported_at", "deadline_at")
        values (
          ${objectId},
          'INTERNAL',
          now(),
          now() + interval '1 hour'
        ) returning id
      `

      return String(row?.id ?? '')
    }

    describe('the base tables', () => {
      it('creates the tables of the base migration', async () => {
        const names = await tables()

        expect(names).toEqual(
          expect.arrayContaining(['users', 'sessions', 'groups', 'user_groups', 'settings']),
        )
      })

      it('gives every uuid primary key a uuid v7', async () => {
        const id = (await newUser()).replaceAll('-', '')

        expect(id).toHaveLength(32)
        expect(id.charAt(12)).toBe('7')
      })

      it('constrains the locale of a user', async () => {
        await expectPgError('23514', () =>
          client`
            insert into "users" ("email", "password_hash", "locale")
            values (${`locale-${randomUUID()}@example.invalid`}, 'hash', 'fr')
          `,
        )
      })

      it('refuses a second user with the same mail address', async () => {
        const email = `same-${randomUUID()}@example.invalid`

        await client`insert into "users" ("email", "password_hash") values (${email}, 'hash')`

        await expectPgError('23505', () =>
          client`insert into "users" ("email", "password_hash") values (${email}, 'hash')`,
        )
      })
    })

    describe('the rbac tables', () => {
      it('creates the tables of the rbac migration', async () => {
        const names = await tables()

        expect(names).toEqual(
          expect.arrayContaining([
            'roles',
            'permissions',
            'role_permissions',
            'user_roles',
            'user_permissions',
          ]),
        )
      })

      it('refuses a second grant of the same permission to the same role', async () => {
        const [role] = await client`insert into "roles" ("key") values (${`r-${randomUUID()}`}) returning id`
        const [permission] = await client`
          insert into "permissions" ("key") values (${`p-${randomUUID()}`}) returning id
        `

        await client`
          insert into "role_permissions" ("role_id", "permission_id")
          values (${role?.id}, ${permission?.id})
        `

        await expectPgError('23505', () =>
          client`
            insert into "role_permissions" ("role_id", "permission_id")
            values (${role?.id}, ${permission?.id})
          `,
        )
      })

      it('refuses an effect that is neither allow nor deny', async () => {
        const userId = await newUser()
        const [permission] = await client`
          insert into "permissions" ("key") values (${`p-${randomUUID()}`}) returning id
        `

        await expectPgError('23514', () =>
          client`
            insert into "user_permissions" ("user_id", "permission_id", "effect")
            values (${userId}, ${permission?.id}, 'maybe')
          `,
        )
      })

      it('protects the role of the administration against a delete', async () => {
        await client`insert into "roles" ("key", "is_system") values ('admin', true)`

        await expectPgError('P0001', () => client`delete from "roles" where "key" = 'admin'`)
      })

      it('takes the grants of a user with the user', async () => {
        const userId = await newUser()
        const [role] = await client`insert into "roles" ("key") values (${`r-${randomUUID()}`}) returning id`

        await client`insert into "user_roles" ("user_id", "role_id") values (${userId}, ${role?.id})`
        await client`delete from "users" where id = ${userId}`

        const rows = await client`select 1 from "user_roles" where "user_id" = ${userId}`

        expect(rows).toHaveLength(0)
      })
    })

    describe('the ticket tables', () => {
      it('creates the tables of the ticket migration', async () => {
        const names = await tables()

        expect(names).toEqual(
          expect.arrayContaining(['tickets', 'ticket_events', 'ticket_photos', 'ticket_no_counter']),
        )
      })

      it('knows the columns of the history of a ticket', async () => {
        const columns = await columnsOf('ticket_events')

        expect(columns).toEqual(
          expect.arrayContaining([
            'id',
            'ticket_id',
            'type',
            'actor_kind',
            'actor_user_id',
            'payload',
            'created_at',
          ]),
        )
      })

      it('allocates a ticket number without a year', async () => {
        const objectId = await newObject()
        const [ticket] = await client`
          insert into "tickets" ("object_id", "source", "reported_at", "deadline_at")
          values (${objectId}, 'INTERNAL', now(), now() + interval '1 hour')
          returning "ticket_no"
        `

        expect(String(ticket?.ticket_no)).toMatch(/^ST-\d{4}$/)
      })

      it('protects the history of a ticket against a change', async () => {
        const objectId = await newObject()
        const ticketId = await newTicket(objectId)
        const [event] = await client`
          insert into "ticket_events" ("ticket_id", "type", "actor_kind")
          values (${ticketId}, 'created', 'system') returning id
        `

        await expectPgError('P0001', () =>
          client`update "ticket_events" set "type" = 'other' where id = ${event?.id}`,
        )
        await expectPgError('P0001', () =>
          client`delete from "ticket_events" where id = ${event?.id}`,
        )
      })

      it('keeps the report attached to its object', async () => {
        await expectPgError('23503', () =>
          client`
            insert into "tickets" ("object_id", "source", "reported_at", "deadline_at")
            values (${randomUUID()}, 'INTERNAL', now(), now() + interval '1 hour')
          `,
        )
      })

      it('refuses a source that the instance does not know', async () => {
        const objectId = await newObject()

        await expectPgError('23514', () =>
          client`
            insert into "tickets" ("object_id", "source", "reported_at", "deadline_at")
            values (${objectId}, 'MAIL', now(), now() + interval '1 hour')
          `,
        )
      })

      it('refuses a photo that is not an image', async () => {
        const objectId = await newObject()
        const ticketId = await newTicket(objectId)

        await expectPgError('23514', () =>
          client`
            insert into "ticket_photos" ("ticket_id", "file_path", "mime_type", "size_bytes")
            values (${ticketId}, '/tmp/photo.pdf', 'application/pdf', 12)
          `,
        )
      })
    })

  },
)
