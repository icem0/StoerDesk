import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    /*
      The global setup builds the pool of the throwaway databases (WP-M28-02):
      one template with the migrations and a clone of it per worker. A test file
      claims one of the clones with an advisory lock, empties it and gives it
      back. The file does not build a database any more, so the migrations of
      the parallel files do not compete for the same PostgreSQL instance
      (WP-M1-12, `PLAN.md` §18.2).
    */
    globalSetup: ['src/db/__tests__/helpers/globalSetup.ts'],
    /*
      On a runner with two cores the ten seconds of the default hook timeout
      were not enough for the last of the files — the file failed with "Hook
      timed out in 10000ms" although the migration itself succeeds in a few
      seconds when the file runs alone (v1.2.37). The hook gets a minute; the
      assertions keep their own timeout and stay as strict as they are.
    */
    hookTimeout: 60_000,
  },
})
