import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

import { loadDotEnvFile, loadEnv } from '../../../config/env'

export const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

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

async function probe(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 })

  try {
    await client`select 1`
  } finally {
    await client.end({ timeout: 1 })
  }
}

/**
 * Opens a Postgres connection string for integration tests.
 *
 * `TEST_DATABASE_URL` (fallback: `DATABASE_URL`) is probed first. When the
 * account may create databases, a throwaway database is created so that
 * migrations always run against an empty database; otherwise the given
 * database is reused. Without a reachable database the tests are skipped.
 */
export async function openTestDatabase(): Promise<TestDatabaseHandle> {
  loadDotEnvFile()
  const env = loadEnv()
  const baseUrl = env.TEST_DATABASE_URL === '' ? env.DATABASE_URL : env.TEST_DATABASE_URL

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
