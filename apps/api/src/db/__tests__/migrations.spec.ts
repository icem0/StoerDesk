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
  entries: { idx: number; tag: string; when: number }[]
}

let journal: Journal | undefined

/**
 * The journal of the migrations — the list of the files in the order they run
 * in. It is read once: the file is read by every case of this file.
 */
function readJournal(): Journal {
  if (journal === undefined) {
    journal = JSON.parse(
      readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8'),
    ) as Journal
  }

  return journal
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.replace('.sql', ''))
    .sort()
}

/**
 * The journal of the migrations (WP-M28-04).
 *
 * Until WP-M28-04 this file also searched the **text** of the migration files
 * for fragments of SQL — `expect(sql).toContain('CREATE TABLE "tickets"')`.
 * Such an assertion says nothing about the database: it breaks when a
 * migration is written differently, and it passes when the migration was never
 * run. The assertions about the schema live in
 * `db/__tests__/schema.integration.spec.ts` now — they read the columns of the
 * real tables and let the database refuse the rows that break a constraint.
 *
 * What stays here is what is really about the files: the journal names every
 * migration, the numbers of the migrations follow each other, and the
 * timestamps of the journal are the milliseconds that Drizzle compares.
 */
describe('the journal of the migrations', () => {
  it('names every migration file once', () => {
    const entries = readJournal().entries
    const files = migrationFiles()

    expect(files).toHaveLength(entries.length)
    expect(entries.map((entry) => entry.tag)).toEqual(files)
  })

  it('numbers the base migration first', () => {
    const entries = readJournal().entries

    expect(entries[0]?.tag).toMatch(/^0000_/)
    expect(entries[0]?.idx).toBe(0)
  })

  it('uses millisecond timestamps for every entry', () => {
    // Drizzle applies an entry only when its `when` is newer than the latest
    // applied one; a seconds value (10 digits) is silently skipped.
    for (const entry of readJournal().entries) {
      expect(entry.when, entry.tag).toBeGreaterThan(1_000_000_000_000)
    }
  })

  it('keeps the timestamps strictly increasing in journal order', () => {
    const entries = readJournal().entries

    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index]?.when, entries[index]?.tag).toBeGreaterThan(
        entries[index - 1]?.when ?? Number.POSITIVE_INFINITY,
      )
    }
  })
})

describe('the base schema', () => {
  it('exposes the base tables and their columns', () => {
    const columnsByTable = [users, sessions, groups, userGroups, settings].map((table) =>
      Object.keys(getTableColumns(table)),
    )

    expect(columnsByTable).toEqual([
      ['id', 'email', 'givenName', 'familyName', 'passwordHash', 'locale', 'theme', 'active', 'mustChangePassword', 'createdVia', 'createdAt', 'updatedAt'],
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

describe('the rbac schema', () => {
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
