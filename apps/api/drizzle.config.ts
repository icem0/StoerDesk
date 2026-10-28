import { defineConfig } from 'drizzle-kit'

import { loadDotEnvFile, loadEnv } from './src/config/env'

loadDotEnvFile()

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: loadEnv().DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
