import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { loadDotEnvFile, loadEnv } from '../config/env'
import { createDatabase } from './client'

loadDotEnvFile()

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

export async function runMigrations(): Promise<void> {
  const env = loadEnv()
  const { client, database } = createDatabase(env.DATABASE_URL)

  try {
    await migrate(database, { migrationsFolder })
  } finally {
    await client.end()
  }
}

const invokedDirectly =
  process.argv[1]?.endsWith('migrate.ts') === true ||
  process.argv[1]?.endsWith('migrate.js') === true

if (invokedDirectly) {
  await runMigrations()
}
