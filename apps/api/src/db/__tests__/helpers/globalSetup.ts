import type { TestProject } from 'vitest/node'

import {
  createTestDatabasePool,
  dropTestDatabasePool,
  TEST_DATABASE_POOL_KEY,
} from './testDatabasePool'

/**
 * The global setup of the API project (WP-M28-02).
 *
 * It builds the pool of the throwaway databases before the first test file
 * runs and hands it to the files with `provide`. The pool holds one database
 * per worker of the run — a file that waits for a free one is faster than a
 * file that builds its own database.
 *
 * Without a reachable database the pool is `unavailable` and the integration
 * tests skip themselves, exactly as before.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const size = Math.max(2, Math.min(12, project.config.maxWorkers))
  const { pool, release } = await createTestDatabasePool({ size })

  project.provide(TEST_DATABASE_POOL_KEY, pool)

  return async () => {
    // The databases go before the lock of the cluster: a run that starts in
    // between must not take them away from this one.
    await dropTestDatabasePool(pool)
    await release()
  }
}
