import { PgBoss } from 'pg-boss'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { BMA_API_KEY_SETTING } from '../../integrations/bmacloud/routes'
import { BMA_ANLAGE_SYNC_QUEUE, startBmaAnlageSync, type BmaSyncLogger } from '../bma-sync'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped bma sync job integration: ${testDatabase.reason}\n`)
}

const { settings } = schema

/**
 * Environment of the job under test. The base URL points at a closed port so the
 * test can never reach the real BMAcloud tenant even if a worker ever fires.
 */
const jobEnv = {
  BMA_SYNC_ENABLED: true,
  BMA_SYNC_CRON: '15 3 * * *',
  BMA_API_BASE_URL: 'http://127.0.0.1:1/',
  BMA_API_KEY: '',
}

function capturingLogger(): { logger: BmaSyncLogger; lines: string[] } {
  const lines: string[] = []
  const record = (obj: unknown, msg?: string) => {
    lines.push(`${msg ?? ''} ${JSON.stringify(obj)}`)
  }

  return {
    logger: { debug: record, info: record, warn: record, error: record },
    lines,
  }
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'BMA sync job — effective bearer key (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    async function storeApiKey(value: string): Promise<void> {
      await db
        .insert(settings)
        .values({ key: BMA_API_KEY_SETTING, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
    }

    async function storeSetting(key: string, value: unknown): Promise<void> {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await db.delete(settings)

      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('refuses to schedule while neither the settings row nor BMA_API_KEY has a key', async () => {
      const { logger, lines } = capturingLogger()

      expect(await startBmaAnlageSync(url, jobEnv, logger)).toBeUndefined()
      expect(lines.join('\n')).toContain(
        'BMA sync job disabled: neither bma.api.key nor BMA_API_KEY is set',
      )
    })

    it('treats an empty settings row as no key at all', async () => {
      await storeApiKey('   ')

      expect(await startBmaAnlageSync(url, jobEnv)).toBeUndefined()

      await db.delete(settings)
    })

    it('schedules when only the settings row carries the key (ADR-0005)', async () => {
      await storeApiKey('deadbeef-key-of-the-test')

      const { logger, lines } = capturingLogger()
      const boss = await startBmaAnlageSync(url, jobEnv, logger)

      expect(boss).toBeInstanceOf(PgBoss)

      if (boss) {
        await boss.stop({ timeout: 2000 })
      }

      const logged = lines.join('\n')

      expect(logged).toContain(BMA_ANLAGE_SYNC_QUEUE)
      expect(logged).toContain('15 3 * * *')
      expect(logged).not.toContain('deadbeef-key-of-the-test')
    })

    it('schedules on the environment key when no row is stored', async () => {
      const boss = await startBmaAnlageSync(url, { ...jobEnv, BMA_API_KEY: 'env-fallback-key' })

      expect(boss).toBeInstanceOf(PgBoss)

      if (boss) {
        await boss.stop({ timeout: 2000 })
      }
    })

    it('still respects the disabled schedule flag when a key exists', async () => {
      await storeApiKey('deadbeef-key-of-the-test')
      await storeSetting('bma.sync.enabled', false)

      expect(await startBmaAnlageSync(url, jobEnv)).toBeUndefined()

      await db.delete(settings)
    })
  },
)
