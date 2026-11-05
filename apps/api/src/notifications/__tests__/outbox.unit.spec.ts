import type { Database } from '../../db/client'
import { loadEnv } from '../../config/env'
import type { Env } from '../../config/env'
import { enqueueOutbox, type OutboxRow } from '../outbox'
import { describe, expect, it } from 'vitest'

type Db = Database['database']

/** The insert capability the create path uses — `DbLike` in `outbox.ts`. */
type DbLike = Pick<Db, 'insert'>

const ticket = {
  id: 'ticket-id-1',
  ticketNo: 'ST-2026-0001',
  priority: 'normal',
  objectName: 'Rathaus',
}

/**
 * Records what the create path hands to the insert chain of `enqueueOutbox`.
 *
 * No PostgreSQL is involved: the create path only inserts, and the unit test
 * asserts the channel resolution and the row shape, never a delivered
 * notification. `state = 'PENDING'` and `attempts = 0` come from the column
 * defaults of migration 0019 and are verified on the create-path integration
 * test, which needs the database.
 */
async function enqueueInto(env: Env): Promise<{ count: number; rows: OutboxRow[] }> {
  const rows: OutboxRow[] = []

  const fakeDatabase = {
    insert: (_table: unknown) => ({
      values: (values: OutboxRow[]) => {
        rows.push(...values)
      },
    }),
  } as unknown as DbLike

  const count = await enqueueOutbox(fakeDatabase, ticket, env)

  return { count, rows }
}

describe('enqueueOutbox (notification outbox rows in the create transaction)', () => {
  it('writes exactly one row for a configured ntfy channel', async () => {
    const { count, rows } = await enqueueInto(
      loadEnv({ NTFY_URL: 'https://ntfy.sh', NTFY_TOPIC: 'stoerdesk' }),
    )

    expect(count).toBe(1)
    expect(rows).toHaveLength(1)

    const [row] = rows
    expect(row?.channel).toBe('ntfy')
    expect(row?.ticketId).toBe('ticket-id-1')
    expect(row?.target).toEqual({
      ticketNo: 'ST-2026-0001',
      priority: 'normal',
      objectName: 'Rathaus',
    })
  })

  it('writes no row for an unconfigured environment', async () => {
    const { count, rows } = await enqueueInto(loadEnv({}))

    expect(count).toBe(0)
    expect(rows).toHaveLength(0)
  })
})
