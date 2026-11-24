import { inject } from 'vitest'

import postgres from 'postgres'

import {
  claimTestDatabase,
  resolveTestDatabaseUrl,
  TEST_DATABASE_POOL_KEY,
  type TestDatabasePool,
} from './testDatabasePool'

export { migrationsFolder } from './testDatabasePool'

const testDatabasePrefix = 'stoerdesk_test_'

export type TestDatabaseHandle =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'available'
      url: string
      /** Set when a throwaway database was created and has to be dropped again. */
      createdDatabase: string | undefined
      close: () => Promise<void>
    }

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

function adminUrlOf(url: string): string {
  return withDatabase(url, 'postgres')
}

/**
 * The pool of the global setup — `undefined` when the tests run outside of a
 * Vitest run with a global setup.
 */
function readPool(): TestDatabasePool | undefined {
  try {
    return inject(TEST_DATABASE_POOL_KEY)
  } catch {
    return undefined
  }
}

/**
 * Opens a Postgres connection string for integration tests.
 *
 * The pool of the global setup (WP-M28-02) hands out a database that is already
 * migrated and empty; the file holds an advisory lock on it and gives it back
 * when it is done. Without a pool — a test file that runs outside of Vitest or
 * a database that the global setup did not reach — the file falls back to the
 * old path: it creates a throwaway database, migrates it and drops it again.
 * Without a reachable database the tests are skipped.
 */
export async function openTestDatabase(): Promise<TestDatabaseHandle> {
  const pool = readPool()

  if (pool?.status === 'available') {
    const claim = await claimTestDatabase(pool)

    return {
      status: 'available',
      url: claim.url,
      createdDatabase: undefined,
      close: claim.release,
    }
  }

  const baseUrl = resolveTestDatabaseUrl()

  try {
    await probe(baseUrl)
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const createdDatabase = `${testDatabasePrefix}${Date.now().toString(36)}${process.pid.toString(36)}`

  try {
    const admin = postgres(adminUrlOf(baseUrl), { max: 1, connect_timeout: 3, idle_timeout: 1 })

    try {
      await admin.unsafe(`CREATE DATABASE "${createdDatabase}"`)
    } finally {
      await admin.end({ timeout: 1 })
    }
  } catch {
    return { status: 'available', url: baseUrl, createdDatabase: undefined, close: async () => {} }
  }

  const close = async () => {
    const admin = postgres(adminUrlOf(baseUrl), { max: 1, connect_timeout: 3, idle_timeout: 1 })

    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${createdDatabase}" WITH (FORCE)`)
    } finally {
      await admin.end({ timeout: 1 })
    }
  }

  return {
    status: 'available',
    url: withDatabase(baseUrl, createdDatabase),
    createdDatabase,
    close,
  }
}

async function probe(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 })

  try {
    await client`select 1`
  } finally {
    await client.end({ timeout: 1 })
  }
}
