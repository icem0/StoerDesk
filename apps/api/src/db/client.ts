import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { loadEnv } from '../config/env'
import * as schema from './schema'

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(databaseUrl: string = loadEnv().DATABASE_URL) {
  const client = postgres(databaseUrl, { max: 10 })
  const database = drizzle(client, { schema })

  return { client, database }
}
