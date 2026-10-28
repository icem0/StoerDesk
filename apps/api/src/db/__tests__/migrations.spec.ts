import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { groups, sessions, settings, userGroups, users } from '../schema'

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url))

type Journal = {
  entries: { idx: number; tag: string }[]
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8')) as Journal
}

function readFirstMigration(): string {
  const [entry] = readJournal().entries
  expect(entry, 'expected at least one migration').toBeDefined()

  return readFileSync(`${migrationsDir}/${entry?.tag}.sql`, 'utf8')
}

describe('migration 0000 base tables', () => {
  const sql = readFirstMigration()

  it('has a single base migration', () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'))

    expect(files).toHaveLength(1)
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

  it('keeps the m1-05 scope out of this migration', () => {
    for (const table of ['roles', 'permissions', 'user_roles', 'group_roles', 'api_keys']) {
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
