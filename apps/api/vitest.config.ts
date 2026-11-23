import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    /*
      The integration tests create their own throwaway database and migrate it
      in their `beforeAll` hook (WP-M1-12, `PLAN.md` §18.2). On a runner with
      two cores the migrations of the parallel files compete for the same
      PostgreSQL instance, and the ten seconds of the default hook timeout are
      not enough for the last of them — the file failed with "Hook timed out
      in 10000ms" although the migration itself succeeds in a few seconds when
      the file runs alone (v1.2.37). The hook gets a minute; the assertions
      keep their own timeout and stay as strict as they are.
    */
    hookTimeout: 60_000,
  },
})
