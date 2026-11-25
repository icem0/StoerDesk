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

    describe('the tables of the on-call', () => {
      it('creates the tables of the on-call migration', async () => {
        const names = await tables()

        expect(names).toEqual(
          expect.arrayContaining([
            'oncall_pools',
            'oncall_shifts',
            'oncall_swap_requests',
            'oncall_events',
          ]),
        )
      })

      it('refuses a pool name that is empty', async () => {
        await expectPgError('23514', () =>
          client`insert into "oncall_pools" ("name") values ('  ')`,
        )
      })

      it('refuses a state of a shift that the instance does not know', async () => {
        const [pool] = await client`
          insert into "oncall_pools" ("name") values (${`pool-${randomUUID()}`}) returning id
        `

        await expectPgError('23514', () =>
          client`
            insert into "oncall_shifts" ("pool_id", "starts_at", "ends_at", "state")
            values (
              ${pool?.id},
              ${'2026-03-02T08:00:00.000Z'}::timestamptz,
              ${'2026-03-02T12:00:00.000Z'}::timestamptz,
              'MAYBE'
            )
          `,
        )
      })

      it('refuses a second shift of a pool that starts at the same time', async () => {
        const [pool] = await client`
          insert into "oncall_pools" ("name") values (${`pool-${randomUUID()}`}) returning id
        `
        const starts = '2026-03-02T08:00:00.000Z'
        const ends = '2026-03-02T12:00:00.000Z'

        await client`
          insert into "oncall_shifts" ("pool_id", "starts_at", "ends_at", "state")
          values (
            ${pool?.id},
            ${starts}::timestamptz,
            ${ends}::timestamptz,
            'PLANNED'
          )
        `

        await expectPgError('23505', () =>
          client`
            insert into "oncall_shifts" ("pool_id", "starts_at", "ends_at", "state")
            values (
              ${pool?.id},
              ${starts}::timestamptz,
              ${ends}::timestamptz,
              'PLANNED'
            )
          `,
        )
      })

      it('takes the shifts of a pool with the pool', async () => {
        const [pool] = await client`
          insert into "oncall_pools" ("name") values (${`pool-${randomUUID()}`}) returning id
        `
        const [shift] = await client`
          insert into "oncall_shifts" ("pool_id", "starts_at", "ends_at", "state")
          values (
            ${pool?.id},
            ${'2026-03-03T08:00:00.000Z'}::timestamptz,
            ${'2026-03-03T12:00:00.000Z'}::timestamptz,
            'PLANNED'
          )
          returning id
        `

        await client`delete from "oncall_pools" where id = ${pool?.id}`

        const rows = await client`select 1 from "oncall_shifts" where id = ${shift?.id}`

        expect(rows).toHaveLength(0)
      })

      it('protects the history of a shift against a change', async () => {
        const [pool] = await client`
          insert into "oncall_pools" ("name") values (${`pool-${randomUUID()}`}) returning id
        `
        const [shift] = await client`
          insert into "oncall_shifts" ("pool_id", "starts_at", "ends_at", "state")
          values (
            ${pool?.id},
            ${'2026-03-04T08:00:00.000Z'}::timestamptz,
            ${'2026-03-04T12:00:00.000Z'}::timestamptz,
            'PLANNED'
          )
          returning id
        `
        const [event] = await client`
          insert into "oncall_events" ("shift_id", "actor_kind", "payload")
          values (${shift?.id}, 'system', '{}') returning id
        `

        await expectPgError('P0001', () =>
          client`update "oncall_events" set "payload" = '{}' where id = ${event?.id}`,
        )
      })
    })

    describe('the tables of the notifications', () => {
      it('creates the tables of the outbox', async () => {
        const names = await tables()

        expect(names).toEqual(
          expect.arrayContaining(['notification_channels', 'push_subscriptions', 'outbox']),
        )
      })

      it('queues a row of the outbox as pending without an attempt', async () => {
        const objectId = await newObject()
        const ticketId = await newTicket(objectId)
        const [row] = await client`
          insert into "outbox" ("ticket_id", "channel", "event_type")
          values (${ticketId}, 'ntfy', 'ticket.created') returning state, attempts
        `

        expect(row?.state).toBe('PENDING')
        expect(row?.attempts).toBe(0)
      })

      it('refuses a state of the outbox that the instance does not know', async () => {
        const objectId = await newObject()
        const ticketId = await newTicket(objectId)

        await expectPgError('23514', () =>
          client`
            insert into "outbox" ("ticket_id", "channel", "event_type", "state")
            values (${ticketId}, 'ntfy', 'ticket.created', 'SENDING')
          `,
        )
      })

      it('refuses a second channel of the same kind', async () => {
        await client`
          insert into "notification_channels" ("kind", "name") values ('ntfy', ${`n-${randomUUID()}`})
        `

        await expectPgError('23505', () =>
          client`
            insert into "notification_channels" ("kind", "name") values ('ntfy', ${`n-${randomUUID()}`})
          `,
        )
      })

      it('knows the target and the confirmation of an account', async () => {
        const columns = await columnsOf('notification_accounts')

        expect(columns).toEqual(expect.arrayContaining(['target', 'verified_at']))
      })

      it('has no table of the selection per event type any more', async () => {
        expect(await tables()).not.toContain('notification_preferences')
      })

      it('creates the table of the tasks of the users', async () => {
        expect(await tables()).toContain('notification_items')
      })

      it('gives the attempt the task it belongs to', async () => {
        const columns = await columnsOf('notification_messages')

        expect(columns).toEqual(expect.arrayContaining(['notification_item_id']))
      })
    })

    describe('the columns of the users', () => {
      it('gives a new account the theme auto and no open password change', async () => {
        const [row] = await client`
          insert into "users" ("email", "password_hash") values (
            ${`theme-${randomUUID()}@example.invalid`}, 'hash'
          ) returning theme, "must_change_password"
        `

        expect(row?.theme).toBe('auto')
        expect(row?.must_change_password).toBe(false)
      })

      it('refuses a theme that the instance does not know', async () => {
        await expectPgError('23514', () =>
          client`
            insert into "users" ("email", "password_hash", "theme")
            values (${`theme-${randomUUID()}@example.invalid`}, 'hash', 'neon')
          `,
        )
      })

      it('derives the family name of a user from the mail address', async () => {
        const [row] = await client`select derive_user_family_name('jane.doe@example.invalid') as name`

        expect(String(row?.name)).toBe('Janedoe')
      })

      it('refuses a name that is longer than 64 characters', async () => {
        await expectPgError('23514', () =>
          client`
            insert into "users" ("email", "password_hash", "family_name")
            values (${`long-${randomUUID()}@example.invalid`}, 'hash', ${'x'.repeat(65)})
          `,
        )
      })
    })

    describe('the tables of the administration', () => {
      it('keeps only the hash of the token of an api key', async () => {
        const columns = await columnsOf('api_keys')

        expect(columns).toEqual(expect.arrayContaining(['token_hash']))
        expect(columns).not.toContain('token')
      })

      it('refuses a scope that the instance does not know', async () => {
        await expectPgError('23514', () =>
          client`
            insert into "api_keys" ("name", "prefix", "token_hash", "scopes")
            values (${`k-${randomUUID()}`}, 'abcd', 'hash', '{everything}')
          `,
        )
      })

      it('names the channel and the kind of the reporter of a ticket', async () => {
        const columns = await columnsOf('tickets')

        expect(columns).toEqual(
          expect.arrayContaining(['reporter_channel', 'reporter_kind', 'reported_by_user_id']),
        )
      })

      it('refuses a channel of the reporter that the instance does not know', async () => {
        const objectId = await newObject()

        await expectPgError('23514', () =>
          client`
            insert into "tickets" (
              "object_id", "source", "reported_at", "deadline_at", "reporter_channel"
            ) values (${objectId}, 'INTERNAL', now(), now() + interval '1 hour', 'carrier-pigeon')
          `,
        )
      })

      it('knows the detail of a failed update run', async () => {
        const columns = await columnsOf('update_runs')

        expect(columns).toEqual(expect.arrayContaining(['error_detail']))
      })
    })

    describe('the tables of the webhooks and of the purges', () => {
      it('creates the tables of the webhooks', async () => {
        const names = await tables()

        expect(names).toEqual(expect.arrayContaining(['webhook_endpoints', 'webhook_deliveries']))
      })

      it('refuses an event of a webhook that the instance does not know', async () => {
        await expectPgError('23514', () =>
          client`
            insert into "webhook_endpoints" ("url", "secret", "events")
            values ('https://example.invalid/hook', 'secret', '{ticket.deleted}')
          `,
        )
      })

      it('refuses a state of a delivery that the instance does not know', async () => {
        const [endpoint] = await client`
          insert into "webhook_endpoints" ("url", "secret", "events")
          values ('https://example.invalid/hook', 'secret', '{ticket.created}') returning id
        `

        await expectPgError('23514', () =>
          client`
            insert into "webhook_deliveries" ("endpoint_id", "event_id", "event_type", "status")
            values (${endpoint?.id}, ${randomUUID()}, 'ticket.created', 'QUEUED')
          `,
        )
      })

      it('protects the log of the purges against a change', async () => {
        const userId = await newUser()
        const [purge] = await client`
          insert into "ticket_purges" (
            "actor_user_id", "ticket_no", "object_no", "deleted_events_count", "deleted_photos_count", "reason"
          ) values (${userId}, 'ST-0001', 'OBJ-01', 0, 0, 'test') returning id
        `

        await expectPgError('P0001', () =>
          client`update "ticket_purges" set "reason" = 'other' where id = ${purge?.id}`,
        )
      })

      it('refuses a reason of a purge that is longer than 1000 characters', async () => {
        const userId = await newUser()

        await expectPgError('23514', () =>
          client`
            insert into "ticket_purges" (
              "actor_user_id", "ticket_no", "object_no", "deleted_events_count", "deleted_photos_count", "reason"
            ) values (${userId}, 'ST-0002', 'OBJ-02', 0, 0, ${'x'.repeat(1001)})
          `,
        )
      })
    })

    describe('the configuration of the instance', () => {
      it('knows the statuses of the workflow', async () => {
        const rows = await client<{ key: string }[]>`select "key" from "ticket_statuses" order by "key"`

        expect(rows.map((row) => row.key)).toEqual(
          expect.arrayContaining(['NEW', 'IN_REVIEW', 'WORK_ORDER_CREATED', 'ASSIGNED', 'CLOSED']),
        )
      })

      it('knows the reserved object without an object', async () => {
        const rows = await client<{ object_no: string; priority: string }[]>`
          select o."object_no", p."priority"
          from "objects" o
          join "object_priority_overrides" p on p."object_id" = o."id"
          where o."object_no" = 'OHNE-OBJEKT'
        `

        expect(rows).toEqual([{ object_no: 'OHNE-OBJEKT', priority: 'low' }])
      })
    })
  },
)
