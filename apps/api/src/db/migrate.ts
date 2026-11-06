import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { databaseConnectionUrl, loadDotEnvFile, loadEnv } from '../config/env'
import { createDatabase } from './client'

loadDotEnvFile()

// The same module is loaded from several places: from the source tree
// (`src/db/migrations`), as the bundled `dist/db/migrate.js` (`dist/db/migrations`)
// and inlined into the bundled `dist/index.js` (`dist/db/migrations`, one level
// up). The folder is the one that carries Drizzle's `meta/_journal.json`.
const migrationFolderCandidates = [
  fileURLToPath(new URL('./migrations', import.meta.url)),
  fileURLToPath(new URL('./db/migrations', import.meta.url)),
]

export function resolveMigrationsFolder(): string {
  const folder = migrationFolderCandidates.find((candidate) =>
    existsSync(join(candidate, 'meta', '_journal.json')),
  )

  if (folder === undefined) {
    throw new Error(`migration journal not found in ${migrationFolderCandidates.join(' or ')}`)
  }

  return folder
}

export async function runMigrations(): Promise<void> {
  const env = loadEnv()
  const { client, database } = createDatabase(databaseConnectionUrl(env))

  try {
    await migrate(database, { migrationsFolder: resolveMigrationsFolder() })
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
