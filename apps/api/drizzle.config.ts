import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://stoerdesk:stoerdesk@localhost:5432/stoerdesk',
  },
  verbose: true,
  strict: true,
})
