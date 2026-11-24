import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { databaseConnectionUrl, loadDotEnvFile, loadEnv } from '../../../config/env'

/**
 * The pool of the throwaway databases of the integration tests (WP-M28-02).
 *
 * Until WP-M28-02 every one of the 128 integration files built its own
 * database: it created one, applied all 63 migrations into it, seeded the RBAC
 * catalog and dropped it again. The drop alone cost about 440 ms and hardly
 * runs in parallel, so half of the runtime of the API project was the
 * housekeeping of the databases.
 *
 * The pool replaces it: the global setup builds **one** template database with
 * the migrations and clones it into a small number of databases. Every test
 * file claims one of them with an advisory lock, empties it and gives it back.
 * The lock is bound to the session of the file, so a file that dies releases
 * its database without a janitor.
 */

/** The folder of the migrations — the same folder the API migrates (WP-M1-12). */
export const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

/** The key under which the pool is handed from the global setup to the files. */
export const TEST_DATABASE_POOL_KEY = 'stoerdeskTestDatabasePool'

const templatePrefix = 'stoerdesk_tpl_'
const databasePrefix = 'stoerdesk_test_'

/**
 * A run that is older than this left its databases behind — the run died, the
 * machine was switched off. A run that is younger belongs to a run that may
 * still be going, and its databases are left alone.
 */
const leftoverAgeMs = 2 * 60 * 60 * 1000

export type TestDatabasePool =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'available'
      /** The URL of the cluster — the database part is replaced per database. */
      baseUrl: string
      /** The name of the template database with the migrations. */
      template: string
      /** The names of the pooled databases. */
      databases: string[]
      /** The tables of the schema, children before their parents. */
      deleteOrder: string[]
      /** The tables with a trigger of their own — a delete would raise there. */
      guardedTables: string[]
      /**
       * The tables the migrations filled with rows — the status catalog, the
       * reserved object without an object and the counter of the ticket
       * numbers. The pool keeps a copy of them, because a test file that
       * changes them must not change the next one.
       */
      configurationTables: string[]
    }

export type TestDatabaseClaim = {
  /** The URL of the claimed database. */
  url: string
  /** Gives the database back — the lock goes with the session. */
  release: () => Promise<void>
}

declare module 'vitest' {
  export interface ProvidedContext {
    stoerdeskTestDatabasePool: TestDatabasePool
  }
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`

  return parsed.toString()
}

function adminUrlOf(url: string): string {
  return withDatabase(url, 'postgres')
}

/** The connection of the cluster: `TEST_DATABASE_URL` wins over `DATABASE_URL`. */
export function resolveTestDatabaseUrl(): string {
  loadDotEnvFile()
  const env = loadEnv()

  return env.TEST_DATABASE_URL === '' ? databaseConnectionUrl(env) : env.TEST_DATABASE_URL
}

function adminClient(url: string) {
  return postgres(adminUrlOf(url), { max: 1, connect_timeout: 3, idle_timeout: 1 })
}

/**
 * A stable key for the advisory lock of a database: the same name always gets
 * the same key, so a second run of the same file cannot take the same
 * database.
 */
function lockKeyOf(database: string): number {
  let hash = 2_166_136_261

  for (const character of database) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

/**
 * The order in which the tables are emptied: a child before its parents, so
 * the foreign keys stay valid while the rows go. The self reference of
 * `tickets` does not matter — the check of a foreign key happens after the
 * statement.
 */
async function readDeleteOrder(
  client: postgres.Sql,
): Promise<{ deleteOrder: string[]; guardedTables: string[] }> {
  const tables = (
    await client`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `
  ).map((row) => row.table_name)

  const foreignKeys = await client`
    select child.relname as child, parent.relname as parent
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace n on n.oid = child.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
  `

  const parents = new Map<string, string[]>(tables.map((table) => [table, []]))

  for (const key of foreignKeys) {
    if (key.child === key.parent) {
      continue
    }

    parents.get(key.child)?.push(key.parent)
  }

  const visited = new Set<string>()
  const order: string[] = []

  const visit = (table: string, path: Set<string>): void => {
    if (visited.has(table)) {
      return
    }

    if (path.has(table)) {
      throw new Error(`the foreign keys of the test database have a cycle at "${table}"`)
    }

    path.add(table)

    for (const parent of parents.get(table) ?? []) {
      visit(parent, path)
    }

    path.delete(table)
    visited.add(table)
    order.push(table)
  }

  for (const table of tables) {
    visit(table, new Set())
  }

  const guarded = (
    await client`
      select distinct c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = 'public'
    `
  ).map((row) => row.table_name)

  return { deleteOrder: [...order].reverse(), guardedTables: guarded }
}

/**
 * The schema that holds the copy of the rows the migrations wrote. The pool
 * restores them after the cleanup, so a test file that changes the catalog of
 * the instance does not change the next one.
 */
const copySchema = 'test_pool'

/**
 * Copies the rows the migrations wrote into the schema of the pool. The tables
 * without a row are not copied — a test file empties them and that is the
 * state the migrations leave behind.
 */
async function copyConfigurationRows(client: postgres.Sql): Promise<string[]> {
  const tables = (
    await client`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `
  ).map((row) => row.table_name)

  const filled: string[] = []

  for (const table of tables) {
    const [row] = await client.unsafe(`SELECT count(*)::int as total FROM "${table}"`)

    if (row?.total > 0) {
      filled.push(table)
    }
  }

  await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "${copySchema}"`)

  for (const table of filled) {
    await client.unsafe(`CREATE TABLE "${copySchema}"."${table}" AS SELECT * FROM "public"."${table}"`)
  }

  return filled
}

/** Empties every table of the schema and restores the rows of the migrations. */
export async function emptyTestDatabase(
  client: postgres.Sql,
  pool: Extract<TestDatabasePool, { status: 'available' }>,
): Promise<void> {
  await emptyDatabase(client, pool.deleteOrder, pool.guardedTables, pool.configurationTables)
}

/**
 * Proves that the session still holds the lock of the database: a database
 * that two files share would let one of them empty the rows of the other one.
 */
async function assertLockHeld(client: postgres.Sql): Promise<void> {
  const [lock] = await client`
    select count(*)::int as held from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid()
  `

  if (lock?.held !== 1) {
    throw new Error('the lock of the test database is gone — another file may share it')
  }
}

async function emptyDatabase(
  client: postgres.Sql,
  deleteOrder: string[],
  guardedTables: string[],
  configurationTables: string[],
): Promise<void> {
  for (const table of guardedTables) {
    await client.unsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`)
  }

  for (const table of deleteOrder) {
    await client.unsafe(`DELETE FROM "${table}"`)
  }

  for (const table of guardedTables) {
    await client.unsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`)
  }

  // The parents come first: the copy of the objects must exist before the
  // priority of the reserved object is written back.
  for (const table of [...configurationTables].reverse()) {
    await client.unsafe(
      `INSERT INTO "public"."${table}" SELECT * FROM "${copySchema}"."${table}"`,
    )
  }
}

/**
 * The time of the run that built a database. The name of the database carries
 * it: `stoerdesk_test_<time>-<pid>_<n>`.
 */
function runTimeOf(database: string): number | undefined {
  const name = database.startsWith(templatePrefix)
    ? database.slice(templatePrefix.length)
    : database.slice(databasePrefix.length)
  const [time] = (name.split('_')[0] ?? '').split('-')

  if (time === undefined || time === '') {
    return undefined
  }

  const stamp = Number.parseInt(time, 36)

  return Number.isNaN(stamp) ? undefined : stamp
}

/**
 * Removes the databases of the runs that died. A database of a run that may
 * still be going is younger than two hours and stays — a second run beside
 * this one must not take its databases away.
 */
async function dropLeftovers(admin: postgres.Sql, ownNames: string[]): Promise<void> {
  const databases = (
    await admin`
      select datname from pg_database
      where datname like ${`${databasePrefix}%`} or datname like ${`${templatePrefix}%`}
    `
  ).map((row) => row.datname)

  const now = Date.now()

  for (const database of databases) {
    if (ownNames.includes(database)) {
      continue
    }

    const runTime = runTimeOf(database)

    if (runTime !== undefined && now - runTime < leftoverAgeMs) {
      continue
    }

    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  }
}

/**
 * Builds the pool: one template with the migrations and a number of clones of
 * it. The connection to the template is closed before the clones are made —
 * PostgreSQL only clones a template without a session on it.
 */
export async function createTestDatabasePool(
  options: { size: number },
): Promise<{ pool: TestDatabasePool; release: () => Promise<void> }> {
  const baseUrl = resolveTestDatabaseUrl()
  const admin = adminClient(baseUrl)
  const runId = `${Date.now().toString(36)}-${process.pid.toString(36)}`
  const template = `${templatePrefix}${runId}`
  const databases = Array.from({ length: options.size }, (_, index) => `${databasePrefix}${runId}_${index}`)

  try {
    await admin`select 1`
  } catch (error) {
    await admin.end({ timeout: 1 })

    return {
      pool: { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) },
      release: async () => {},
    }
  }

  await dropLeftovers(admin, [template, ...databases])

  try {
    await admin.unsafe(`CREATE DATABASE "${template}"`)
  } catch (error) {
    await admin.end({ timeout: 1 })

    return {
      pool: {
        status: 'unavailable',
        reason: `the account may not create a database: ${error instanceof Error ? error.message : String(error)}`,
      },
      release: async () => {},
    }
  }

  const templateUrl = withDatabase(baseUrl, template)
  const templateClient = postgres(templateUrl, { max: 2, connect_timeout: 5 })

  try {
    await migrate(drizzle(templateClient, { schema: {} }), { migrationsFolder })
  } finally {
    await templateClient.end({ timeout: 2 })
  }

  const schemaClient = postgres(templateUrl, { max: 1, connect_timeout: 5 })

  let deleteOrder: string[]
  let guardedTables: string[]
  let configurationTables: string[]

  try {
    ;({ deleteOrder, guardedTables } = await readDeleteOrder(schemaClient))
    const filled = await copyConfigurationRows(schemaClient)

    // The order of the delete: the children come first — the copy of the
    // objects is written back before the priority of the reserved object.
    configurationTables = filled.sort(
      (left, right) => deleteOrder.indexOf(left) - deleteOrder.indexOf(right),
    )
  } finally {
    await schemaClient.end({ timeout: 2 })
  }

  for (const database of databases) {
    await admin.unsafe(`CREATE DATABASE "${database}" TEMPLATE "${template}"`)
  }

  return {
    pool: {
      status: 'available',
      baseUrl,
      template,
      databases,
      deleteOrder,
      guardedTables,
      configurationTables,
    },
    release: async () => {
      await admin.end({ timeout: 2 })
    },
  }
}

/** Removes the template and the clones of the pool. */
export async function dropTestDatabasePool(pool: TestDatabasePool): Promise<void> {
  if (pool.status !== 'available') {
    return
  }

  const admin = adminClient(pool.baseUrl)

  try {
    for (const database of [...pool.databases, pool.template]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    }
  } finally {
    await admin.end({ timeout: 2 })
  }
}

/**
 * Claims one of the pooled databases for a test file: the file holds an
 * advisory lock on it, so no other file gets the same one. The database is
 * empty when the claim comes back.
 */
export async function claimTestDatabase(pool: TestDatabasePool): Promise<TestDatabaseClaim> {
  if (pool.status !== 'available') {
    throw new Error('claimTestDatabase needs an available pool')
  }

  const deadline = Date.now() + 300_000

  while (true) {
    for (const database of pool.databases) {
      const url = withDatabase(pool.baseUrl, database)
      const client = postgres(url, { max: 1, connect_timeout: 5 })

      try {
        const [locked] = await client`select pg_try_advisory_lock(${lockKeyOf(database)}) as locked`

        if (locked?.locked !== true) {
          await client.end({ timeout: 1 })

          continue
        }

        await assertLockHeld(client)
        await emptyTestDatabase(client, pool)

        return {
          url,
          release: async () => {
            await client.end({ timeout: 2 })
          },
        }
      } catch (error) {
        await client.end({ timeout: 1 })

        throw error
      }
    }

    if (Date.now() > deadline) {
      throw new Error('no test database of the pool became free')
    }

    await new Promise((done) => {
      setTimeout(done, 100)
    })
  }
}
