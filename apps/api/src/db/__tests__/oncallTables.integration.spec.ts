import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { oncallEvents, oncallPools, oncallShifts, oncallSwapRequests } from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

/** Drizzle wraps driver errors, so the Postgres error may sit in `cause`. */
function causeOf(error: unknown): unknown {
  return error instanceof PostgresError ? error : (error as { cause?: unknown }).cause
}

async function expectPgError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const pgError = causeOf(error)

    expect(pgError).toBeInstanceOf(PostgresError)
    expect((pgError as PostgresError).code).toBe(code)

    return
  }

  throw new Error(`expected postgres error ${code}`)
}

describe.skipIf(testDatabase.status === 'unavailable')('on-call tables (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 8 })
  const db = drizzle(client, {
    schema: { oncallPools, oncallShifts, oncallSwapRequests, oncallEvents },
  })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function newPool(groupId: string | null = null, name = `Pool ${randomUUID().slice(0, 5)}`) {
    const [pool] = await db
      .insert(oncallPools)
      .values({ name, groupId, active: true })
      .returning({ id: oncallPools.id })
    return onlyRow(pool ? [pool] : [], 'pool').id
  }

  async function newUserRow(): Promise<string> {
    const email = `tech-${randomUUID().slice(0, 5)}@example.invalid`
    const rows = await client<{ id: string }[]>`
      insert into "users" ("email", "password_hash", "given_name", "family_name")
      values (${email}, 'x', 'Tech', 'User')
      returning "id"`
    return onlyRow(rows, 'user').id
  }

  async function newShift(poolId: string, userId: string | null = null) {
    const startsAt = new Date('2026-03-23T06:00:00Z')
    const endsAt = new Date('2026-03-30T05:00:00Z')
    const [shift] = await db
      .insert(oncallShifts)
      .values({ poolId, userId, state: 'UNFILLED', startsAt, endsAt })
      .returning({ id: oncallShifts.id })
    return onlyRow(shift ? [shift] : [], 'shift').id
  }

  it('creates the on-call tables of migration 0020', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('oncall_pools', 'oncall_shifts', 'oncall_swap_requests', 'oncall_events')
      order by table_name`

    expect(rows.map((row) => row.table_name)).toEqual([
      'oncall_events',
      'oncall_pools',
      'oncall_shifts',
      'oncall_swap_requests',
    ])
  })

  it('rejects a duplicate pool name case-insensitively', async () => {
    await newPool(null, 'Feuermeldeanlage')

    await expectPgError('23505', () => newPool(null, 'FEUERMELDEANLAGE'))
  })

  it('rejects a duplicate shift start per pool', async () => {
    const poolId = await newPool()
    const startsAt = new Date('2026-03-23T06:00:00Z')
    const endsAt = new Date('2026-03-30T05:00:00Z')

    await db.insert(oncallShifts).values({ poolId, state: 'UNFILLED', startsAt, endsAt })

    await expectPgError('23505', () =>
      db.insert(oncallShifts).values({ poolId, state: 'UNFILLED', startsAt, endsAt }),
    )
  })

  it('allows at most one PENDING swap request per shift', async () => {
    const userId = await newUserRow()
    const poolId = await newPool()
    const shiftId = await newShift(poolId, userId)

    await db.insert(oncallSwapRequests).values({
      shiftId,
      requestedByUserId: userId,
      status: 'PENDING',
    })

    await expectPgError('23505', () =>
      db.insert(oncallSwapRequests).values({
        shiftId,
        requestedByUserId: userId,
        status: 'PENDING',
      }),
    )
  })

  it('blocks updates and deletes on oncall_events', async () => {
    const userId = await newUserRow()
    const poolId = await newPool()
    const shiftId = await newShift(poolId, userId)
    const clientUuid = randomUUID()

    const event = onlyRow(
      await db
        .insert(oncallEvents)
        .values({
          shiftId,
          actorKind: 'user',
          actorUserId: userId,
          payload: { kind: 'confirmed' },
          clientUuid,
        })
        .returning({ id: oncallEvents.id, type: oncallEvents.payload }),
      'event',
    )

    await expectPgError('P0001', () =>
      client`update oncall_events set payload = '{"kind":"tampered"}' where id = ${event.id}`,
    )
    await expectPgError('P0001', () =>
      client`delete from oncall_events where id = ${event.id}`,
    )

    try {
      await client`update oncall_events set payload = '{"kind":"tampered"}' where id = ${event.id}`
    } catch (error) {
      expect(String(causeOf(error))).toContain('oncall_event_append_only')
    }

    const kept = await db
      .select({ id: oncallEvents.id })
      .from(oncallEvents)
      .where(eq(oncallEvents.id, event.id))

    expect(kept).toEqual([{ id: event.id }])
  })

  it('cascades events when a shift is removed', async () => {
    const userId = await newUserRow()
    const poolId = await newPool()
    const shiftId = await newShift(poolId, userId)

    await db.insert(oncallEvents).values({
      shiftId,
      actorKind: 'user',
      actorUserId: userId,
      payload: { kind: 'confirmed' },
    })

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL stoerdesk.allow_oncall_event_delete = 'true'`)
      await tx.delete(oncallShifts).where(eq(oncallShifts.id, shiftId))
    })

    const remainingEvents = await db
      .select({ id: oncallEvents.id })
      .from(oncallEvents)
      .where(eq(oncallEvents.shiftId, shiftId))

    expect(remainingEvents).toHaveLength(0)
  })

  it('rejects a duplicate client_uuid and unknown state values', async () => {
    const userId = await newUserRow()
    const poolId = await newPool()
    const shiftId = await newShift(poolId, userId)
    const clientUuid = randomUUID()

    await db.insert(oncallEvents).values({
      shiftId,
      actorKind: 'user',
      actorUserId: userId,
      clientUuid,
    })

    await expectPgError('23505', () =>
      db.insert(oncallEvents).values({
        shiftId,
        actorKind: 'user',
        clientUuid,
      }),
    )
    await expectPgError('23514', () =>
      db.insert(oncallShifts).values({ poolId, state: 'BOGUS', startsAt: new Date(), endsAt: new Date() }),
    )
  })
})
