import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { evaluateEscalations } from '../../tickets/escalation'
import { TICKET_ESCALATION_CRON, TICKET_ESCALATION_QUEUE } from '../escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation job integration: ${testDatabase.reason}\n`)
}

describe('escalation job constants', () => {
  it('uses the documented queue and cron', () => {
    expect(TICKET_ESCALATION_QUEUE).toBe('ticket-escalation')
    expect(TICKET_ESCALATION_CRON).toBe('* * * * *')
  })
})

describe.skipIf(testDatabase.status === 'unavailable')('escalation job (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('runs one direct scan without a pg-boss scheduler', async () => {
    const result = await evaluateEscalations(db)

    expect(result.scanned).toBeGreaterThanOrEqual(0)
    expect(result.fired).toBeGreaterThanOrEqual(0)
    expect(result.skipped).toBe(result.scanned - result.fired)
  })
})
