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
      ['id', 'email', 'passwordHash', 'locale', 'active', 'createdAt', 'updatedAt'],
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
    expect(sql).toContain('IF TG_OP = \'DELETE\' AND pg_trigger_depth() > 1 THEN')
    expect(sql).toContain('CREATE TRIGGER ticket_events_is_append_only')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "ticket_events"')
  })

  it('keeps the report attached to its object and softens the other links', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE restrict',
    )
    expect(sql).toContain(
      'FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE set null',
    )
    expect(sql).toContain(
      'FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade',
    )
    expect(sql).toContain('CREATE UNIQUE INDEX "tickets_client_uuid_key"')
    expect(sql).toContain(`CHECK ("tickets"."source" IN ('QR', 'INTERNAL', 'API'))`)
    expect(sql).toContain(`CHECK ("ticket_photos"."mime_type" IN ('image/jpeg', 'image/png'))`)
  })
})
