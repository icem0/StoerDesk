import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  groups,
  permissions,
  rolePermissions,
  roles,
  sessions,
  settings,
  userGroups,
  userPermissions,
  userRoles,
  users,
} from '../schema'

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url))

type Journal = {
  entries: { idx: number; tag: string }[]
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8')) as Journal
}

function readMigration(tag: string): string {
  const entry = readJournal().entries.find((candidate) => candidate.tag === tag)
  expect(entry, `expected migration ${tag}`).toBeDefined()

  return readFileSync(`${migrationsDir}/${entry?.tag}.sql`, 'utf8')
}

function readFirstMigration(): string {
  const [entry] = readJournal().entries
  expect(entry, 'expected at least one migration').toBeDefined()

  return readFileSync(`${migrationsDir}/${entry?.tag}.sql`, 'utf8')
}

describe('migration 0000 base tables', () => {
  const sql = readFirstMigration()

  it('numbers the base migration first', () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'))

    expect(files).toHaveLength(readJournal().entries.length)
    expect(readJournal().entries[0]?.tag).toMatch(/^0000_/)
  })

  it('creates the uuid v7 function before the tables', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION gen_uuid_v7()')
    expect(sql.indexOf('gen_uuid_v7()')).toBeLessThan(sql.indexOf('CREATE TABLE "users"'))
  })

  it.each(['users', 'sessions', 'groups', 'user_groups', 'settings'])(
    'creates table %s',
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    },
  )

  it('uses uuid v7 as default for every uuid primary key', () => {
    for (const table of ['users', 'sessions', 'groups']) {
      const block = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\);`).exec(sql)?.[1] ?? ''

      expect(block).toMatch(/"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7\(\) NOT NULL/)
    }
  })

  it('keeps the rbac scope out of the base migration', () => {
    for (const table of ['roles', 'permissions', 'role_permissions', 'user_roles', 'api_keys']) {
      expect(sql).not.toContain(`CREATE TABLE "${table}"`)
    }
  })

  it('cascades dependent rows and constrains the locale', () => {
    expect(sql).toContain(
      'ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain('CONSTRAINT "user_groups_pk" PRIMARY KEY("user_id","group_id")')
    expect(sql).toContain(`CHECK ("users"."locale" IN ('de', 'en'))`)
    expect(sql).toContain('CREATE UNIQUE INDEX "users_email_key"')
    expect(sql).toContain('CREATE UNIQUE INDEX "sessions_token_hash_key"')
  })
})

describe('base schema', () => {
  it('exposes the base tables and their columns', () => {
    const columnsByTable = [users, sessions, groups, userGroups, settings].map((table) =>
      Object.keys(getTableColumns(table)),
    )

    expect(columnsByTable).toEqual([
      ['id', 'email', 'givenName', 'familyName', 'passwordHash', 'locale', 'theme', 'active', 'createdAt', 'updatedAt'],
      ['id', 'userId', 'tokenHash', 'expiresAt', 'createdAt'],
      ['id', 'name', 'createdAt', 'updatedAt'],
      ['userId', 'groupId', 'createdAt'],
      ['key', 'value', 'updatedAt'],
    ])
  })

  it('keeps amounts out of the schema (no money in StörDesk)', () => {
    const allColumns = [users, sessions, groups, userGroups, settings]
      .flatMap((table) => Object.keys(getTableColumns(table)))
      .join(' ')

    expect(allColumns).not.toMatch(/amount|price|cost|currency|betrag/i)
  })
})

describe('migration 0001 rbac tables', () => {
  const sql = readMigration('0001_rbac_tables')

  it.each(['roles', 'permissions', 'role_permissions', 'user_roles', 'user_permissions'])(
    'creates table %s',
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    },
  )

  it('uses uuid v7 for the new catalog keys and joins on the base tables', () => {
    for (const table of ['permissions', 'roles']) {
      const block = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\);`).exec(sql)?.[1] ?? ''

      expect(block).toMatch(/"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7\(\) NOT NULL/)
    }

    expect(sql).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade',
    )
    expect(sql).toContain('CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")')
    expect(sql).toContain(`CHECK ("user_permissions"."effect" IN ('allow', 'deny'))`)
    expect(sql).toContain('CREATE UNIQUE INDEX "roles_key_key"')
    expect(sql).toContain('CREATE UNIQUE INDEX "permissions_key_key"')
  })

  it('protects system roles against DELETE with a trigger', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION protect_system_roles()')
    expect(sql).toContain("RAISE EXCEPTION 'system_role_protected: %', OLD.key")
    expect(sql).toContain('CREATE TRIGGER roles_is_system_protected')
    expect(sql).toContain('BEFORE DELETE ON "roles"')
  })
})

describe('rbac schema', () => {
  it('exposes the rbac tables and their columns', () => {
    const columnsByTable = [roles, permissions, rolePermissions, userRoles, userPermissions].map(
      (table) => Object.keys(getTableColumns(table)),
    )

    expect(columnsByTable).toEqual([
      ['id', 'key', 'isSystem', 'createdAt', 'updatedAt'],
      ['id', 'key', 'createdAt'],
      ['roleId', 'permissionId', 'createdAt'],
      ['userId', 'roleId', 'createdAt'],
      ['userId', 'permissionId', 'effect', 'createdAt'],
    ])
  })
})

describe('migration 0004 ticket tables', () => {
  const sql = readMigration('0004_ticket_tables')

  it.each(['tickets', 'ticket_events', 'ticket_photos', 'ticket_no_counters'])(
    'creates table %s',
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    },
  )

  it('defines next_ticket_no() before the tickets table that defaults to it', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION next_ticket_no()')
    expect(sql.indexOf('CREATE OR REPLACE FUNCTION next_ticket_no()')).toBeLessThan(
      sql.indexOf('CREATE TABLE "tickets"'),
    )
    expect(sql).toContain('"ticket_no" text DEFAULT next_ticket_no() NOT NULL')
    expect(sql).toContain("RETURN 'ST-' || report_year || '-' || lpad(allocated::text, 4, '0');")
  })

  it('protects ticket_events with an append-only trigger', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION ticket_events_append_only()')
    expect(sql).toContain("RAISE EXCEPTION 'ticket_event_append_only: %', OLD.type")
    expect(sql).toContain("IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN")
    expect(sql).toContain('CREATE TRIGGER ticket_events_is_append_only')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "ticket_events"')
  })

  it('keeps the report attached to its object and softens the other links', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE restrict',
    )
    expect(sql).toContain(
      'FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade',
    )
    expect(sql).toContain('CREATE UNIQUE INDEX "tickets_client_uuid_key"')
    expect(sql).toContain(`CHECK ("tickets"."source" IN ('QR', 'INTERNAL', 'API'))`)
    expect(sql).toContain(`CHECK ("ticket_photos"."mime_type" IN ('image/jpeg', 'image/png'))`)
  })
})

describe('migration 0011 update run error detail', () => {
  const sql = readMigration('0011_update_runs_error_detail')

  it('adds only the nullable detail column to update_runs', () => {
    expect(sql).toContain('ALTER TABLE "update_runs" ADD COLUMN "error_detail" text;')
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(1)
  })

  it('is the last entry of the journal', () => {
    const entries = readJournal().entries

    expect(entries.at(-1)?.tag).toBe('0023_ticket_is_test')
    expect(entries.at(-1)?.idx).toBe(entries.length - 1)
  })
})

describe('migration journal integrity', () => {
  const entries = readJournal().entries as { idx: number; tag: string; when: number }[]

  it('uses millisecond timestamps for every entry', () => {
    // Drizzle applies an entry only when its `when` is newer than the latest
    // applied one; a seconds value (10 digits) is silently skipped.
    for (const entry of entries) {
      expect(entry.when, entry.tag).toBeGreaterThan(1_000_000_000_000)
    }
  })

  it('keeps the timestamps strictly increasing in journal order', () => {
    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index]?.when, entries[index]?.tag).toBeGreaterThan(
        entries[index - 1]?.when ?? Number.POSITIVE_INFINITY,
      )
    }
  })
})

describe('migration 0021 ticket purges repair', () => {
  const sql = readMigration('0021_ticket_purges_repair')

  it('recreates ticket_purges idempotently', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ticket_purges"')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ticket_purges_created_at_idx"')
    expect(sql).toContain('WHEN duplicate_object THEN NULL')
  })
})

describe('migration 0020 on-call tables', () => {
  const sql = readMigration('0020_oncall_tables')

  it.each(['oncall_pools', 'oncall_shifts', 'oncall_swap_requests', 'oncall_events'])(
    'creates table %s',
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    },
  )

  it('constrains pool names, shift states and swap statuses', () => {
    expect(sql).toContain(
      `CONSTRAINT "oncall_pools_name_trimmed_length_check" CHECK (TRIM("oncall_pools"."name") = "oncall_pools"."name" AND LENGTH("oncall_pools"."name") BETWEEN 1 AND 100)`,
    )
    expect(sql).toContain(
      `CONSTRAINT "oncall_shifts_state_check" CHECK ("oncall_shifts"."state" IN ('UNFILLED', 'DRAFT', 'PLANNED', 'CONFIRMED', 'DECLINED', 'SWAP_REQUESTED'))`,
    )
    expect(sql).toContain(
      `CONSTRAINT "oncall_shifts_ends_at_after_starts_at_check" CHECK ("oncall_shifts"."ends_at" > "oncall_shifts"."starts_at")`,
    )
    expect(sql).toContain(
      `CONSTRAINT "oncall_swap_requests_status_check" CHECK ("oncall_swap_requests"."status" IN ('PENDING', 'ACCEPTED', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED'))`,
    )
    expect(sql).toContain(
      `CONSTRAINT "oncall_events_actor_kind_check" CHECK ("oncall_events"."actor_kind" IN ('user', 'system'))`,
    )
  })

  it('indexes the shift range, keeps one slot start per pool and one pending swap per shift', () => {
    expect(sql).toContain(
      'CREATE INDEX "oncall_shifts_pool_id_starts_at_ends_at_idx" ON "oncall_shifts" USING btree ("pool_id","starts_at","ends_at")',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "oncall_shifts_pool_id_starts_at_key" ON "oncall_shifts" USING btree ("pool_id","starts_at")',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "oncall_swap_requests_one_pending_per_shift" ON "oncall_swap_requests" USING btree ("shift_id") WHERE "oncall_swap_requests"."status" = \'PENDING\'',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "oncall_pools_name_key" ON "oncall_pools" USING btree (lower("name"))',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "oncall_events_client_uuid_key" ON "oncall_events" USING btree ("client_uuid")',
    )
  })

  it('cascades pool, shift and user deletions and protects events with the append-only trigger', () => {
    expect(sql).toContain(
      'ALTER TABLE "oncall_shifts" ADD CONSTRAINT "oncall_shifts_pool_id_oncall_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."oncall_pools"("id") ON DELETE cascade ON UPDATE no action;',
    )
    expect(sql).toContain(
      'ALTER TABLE "oncall_events" ADD CONSTRAINT "oncall_events_shift_id_oncall_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."oncall_shifts"("id") ON DELETE cascade ON UPDATE no action;',
    )
    expect(sql).toContain('CREATE OR REPLACE FUNCTION oncall_event_append_only()')
    expect(sql).toContain("RAISE EXCEPTION 'oncall_event_append_only'")
    expect(sql).toContain('CREATE TRIGGER oncall_events_is_append_only')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "oncall_events"')
    expect(sql).toContain('EXECUTE FUNCTION oncall_event_append_only()')
  })
})

describe('migration 0019 notification outbox', () => {
  const sql = readMigration('0019_notification_outbox')

  it.each(['notification_channels', 'push_subscriptions', 'outbox'])(
    'creates table %s',
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    },
  )

  it('defaults an enqueued row to pending, zero attempts and a soft object link', () => {
    expect(sql).toContain(`"state" text DEFAULT 'PENDING' NOT NULL`)
    expect(sql).toContain('"attempts" integer DEFAULT 0 NOT NULL')
    expect(sql).toContain(
      'ALTER TABLE "outbox" ADD CONSTRAINT "outbox_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade',
    )
  })

  it('locks the delivery state and indexes the drain order', () => {
    expect(sql).toContain(
      `CONSTRAINT "outbox_state_check" CHECK ("outbox"."state" IN ('PENDING', 'SENT', 'FAILED'))`,
    )
    expect(sql).toContain('CREATE INDEX "outbox_state_created_at_idx" ON "outbox" USING btree ("state","created_at")')
    expect(sql).toContain('CREATE UNIQUE INDEX "notification_channels_name_key"')
  })
})

describe('migration 0016 user theme', () => {
  const sql = readMigration('0016_user_theme')

  it('adds the theme column with the auto default and constrains the values', () => {
    expect(sql).toContain(`ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'auto' NOT NULL;`)
    expect(sql).toContain(
      `ALTER TABLE "users" ADD CONSTRAINT "users_theme_check" CHECK ("users"."theme" IN ('auto', 'light', 'dark'));`,
    )
  })

  it('touches the users table only', () => {
    expect(sql).not.toContain('tickets')
    expect(sql).not.toContain('sessions')
  })
})

describe('migration 0018 user klarmname columns', () => {
  const sql = readMigration('0018_user_klarmname')

  it('derives the sortable family name before the columns are filled', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION derive_user_family_name(email text)')
    expect(sql.indexOf('derive_user_family_name(email text)')).toBeLessThan(
      sql.indexOf('ALTER TABLE "users" ADD COLUMN "given_name"'),
    )
  })

  it('adds both name columns as not-null text with an empty default', () => {
    expect(sql).toContain(`ALTER TABLE "users" ADD COLUMN "given_name" text DEFAULT '' NOT NULL;`)
    expect(sql).toContain(`ALTER TABLE "users" ADD COLUMN "family_name" text DEFAULT '' NOT NULL;`)
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(2)
  })

  it('caps the length and stores both names trimmed', () => {
    expect(sql).toContain(`ALTER TABLE "users" ADD CONSTRAINT "users_given_name_length_check" CHECK (LENGTH("users"."given_name") <= 64);`)
    expect(sql).toContain(`ALTER TABLE "users" ADD CONSTRAINT "users_family_name_length_check" CHECK (LENGTH("users"."family_name") <= 64);`)
    expect(sql).toContain(
      `ALTER TABLE "users" ADD CONSTRAINT "users_klarmname_trimmed_check" CHECK (TRIM("users"."given_name") = "users"."given_name" AND TRIM("users"."family_name") = "users"."family_name");`,
    )
  })

  it('fills the existing rows and indexes the sortable order', () => {
    expect(sql).toContain(
      `UPDATE "users" SET "family_name" = derive_user_family_name("email") WHERE "family_name" = '';`,
    )
    expect(sql).toContain(
      'CREATE INDEX "users_name_idx" ON "users" USING btree (lower("family_name") , lower("given_name") );',
    )
  })
})
