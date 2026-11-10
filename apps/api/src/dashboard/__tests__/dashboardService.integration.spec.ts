import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { objects, oncallPools, oncallShifts, outbox, tickets, users } from '../../db/schema'
import {
  buildDashboardSnapshot,
  resolveBurningNow,
  resolveChannelStatus,
  resolveDashboardEvaluations,
  resolveDashboardTiles,
  resolveFaultFreeCounter,
  resolveFaultFreeRecord,
  resolveOnCallTile,
} from '../service'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped dashboard snapshot service: ${testDatabase.reason}\n`)
}

function onlyRow<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`expected ${what}`)
  }
  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('dashboard snapshot service (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  const now = new Date('2026-03-10T10:00:00Z')
  let objectId = ''
  let technicianId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    const [object] = await db
      .insert(objects)
      .values({ objectNo: `DASH_${Date.now().toString(36)}`, name: 'Feuerwache Nord' })
      .returning({ id: objects.id })
    objectId = onlyRow(object, 'the inserted object').id

    const [technician] = await db
      .insert(users)
      .values({
        email: `dash-tech-${Date.now().toString(36)}@example.org`,
        givenName: 'Max',
        familyName: 'Muster',
        passwordHash: 'no-login',
        active: true,
      })
      .returning({ id: users.id })
    technicianId = onlyRow(technician, 'the inserted technician').id

    const [pool] = await db
      .insert(oncallPools)
      .values({ name: 'Alpha Bereitschaft' })
      .returning({ id: oncallPools.id })
    const poolId = onlyRow(pool, 'the inserted pool').id

    await db.insert(oncallShifts).values({
      poolId,
      userId: technicianId,
      state: 'CONFIRMED',
      startsAt: new Date('2026-03-10T08:00:00Z'),
      endsAt: new Date('2026-03-10T12:00:00Z'),
    })

    const [ticketA] = await db
      .insert(tickets)
      .values({
        objectId,
        ticketNo: 'ST-2026-0001',
        status: 'NEW',
        priority: 'normal',
        source: 'QR',
        reportedAt: new Date('2026-03-09T08:00:00Z'),
        receivedAt: new Date('2026-03-09T08:00:00Z'),
        deadlineAt: new Date('2026-03-09T08:00:00Z'),
        isTest: false,
        suspectedSpam: false,
      })
      .returning({ id: tickets.id })
    const ticketAId = onlyRow(ticketA, 'ticket A').id

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0002',
      status: 'ACKNOWLEDGED',
      priority: 'normal',
      source: 'QR',
      reportedAt: new Date('2026-03-10T08:00:00Z'),
      receivedAt: new Date('2026-03-10T08:00:00Z'),
      deadlineAt: new Date('2026-03-11T08:00:00Z'),
      isTest: false,
      suspectedSpam: false,
      acknowledgedAt: new Date('2026-03-10T09:00:00Z'),
    })

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0003',
      status: 'NEW',
      priority: 'normal',
      source: 'QR',
      reportedAt: new Date('2026-03-10T09:00:00Z'),
      receivedAt: new Date('2026-03-10T09:00:00Z'),
      deadlineAt: new Date('2026-03-11T09:00:00Z'),
      isTest: true,
      suspectedSpam: false,
    })

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0004',
      status: 'CANCELLED',
      priority: 'normal',
      source: 'QR',
      reportedAt: new Date('2026-03-10T09:30:00Z'),
      receivedAt: new Date('2026-03-10T09:30:00Z'),
      deadlineAt: new Date('2026-03-11T09:30:00Z'),
      isTest: false,
      suspectedSpam: false,
    })

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0005',
      status: 'OFFERED',
      priority: 'normal',
      source: 'QR',
      reportedAt: new Date('2026-03-10T07:00:00Z'),
      receivedAt: new Date('2026-03-10T09:45:00Z'),
      deadlineAt: new Date('2026-03-10T12:00:00Z'),
      isTest: false,
      suspectedSpam: false,
      assignedUserId: null,
    })

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0006',
      status: 'CLOSED',
      priority: 'normal',
      source: 'QR',
      reportedAt: new Date('2026-03-09T08:00:00Z'),
      receivedAt: new Date('2026-03-09T08:00:00Z'),
      deadlineAt: new Date('2026-03-09T12:00:00Z'),
      isTest: false,
      suspectedSpam: false,
      reviewStartedAt: new Date('2026-03-09T09:00:00Z'),
      firstResponseAt: new Date('2026-03-09T09:30:00Z'),
      acknowledgedAt: new Date('2026-03-09T10:00:00Z'),
      closedAt: new Date('2026-03-09T14:00:00Z'),
    })

    await db.insert(outbox).values({
      ticketId: ticketAId,
      channel: 'ntfy',
      state: 'SENT',
      createdAt: new Date('2026-03-10T09:00:00Z'),
    })

    await db.insert(outbox).values({
      ticketId: ticketAId,
      channel: 'smtp',
      state: 'FAILED',
      createdAt: new Date('2026-03-10T09:30:00Z'),
    })

    await db.insert(outbox).values({
      ticketId: ticketAId,
      channel: 'smtp',
      state: 'PENDING',
      createdAt: new Date('2026-03-10T09:45:00Z'),
    })
  })

  it('resolves the fault-free counter: since is the newest qualifying report', async () => {
    const counter = await resolveFaultFreeCounter(db, now)

    expect(counter.since).toBe('2026-03-10T08:00:00.000Z')
    expect(counter.days).toBe(0)
  })

  it('ignores test and cancelled tickets for the counter', async () => {
    const counter = await resolveFaultFreeCounter(db, now)
    expect(counter.since).toBe('2026-03-10T08:00:00.000Z')
    expect(counter.days).toBe(0)
  })

  it('computes the record from the longest historic gap', async () => {
    // Gap between Mar 9 08:00 and Mar 10 08:00 (Berlin dates) = 1 day,
    // running gap from Mar 10 08:00 to now (same Berlin day) = 0 days.
    expect(await resolveFaultFreeRecord(db, now)).toBe(1)
  })

  it('resolves the dashboard tiles', async () => {
    const tiles = await resolveDashboardTiles(db, now)

    expect(tiles.open).toBe(4)
    expect(tiles.openByStatus).toMatchObject({
      NEW: 2,
      ACKNOWLEDGED: 1,
      OFFERED: 1,
    })
    expect(tiles.overdue).toBe(1)
    expect(tiles.unreviewed).toBe(2)
    expect(tiles.poolSize).toBe(1)
  })

  it('resolves evaluation averages over the last 30 days', async () => {
    const evaluations = await resolveDashboardEvaluations(db, now)

    expect(evaluations.windowDays).toBe(30)
    // Qualifying in the window: ST-2026-0001, ST-2026-0002, ST-2026-0005 and
    // the closed ST-2026-0006 — not the test ticket, not the cancelled one.
    expect(evaluations.tickets).toBe(4)
    expect(evaluations.averageReviewMinutes).toBe(60)
    expect(evaluations.averageFirstResponseMinutes).toBe(90)
    expect(evaluations.averageAcknowledgeMinutes).toBe(90)
    expect(evaluations.averageProcessingMinutes).toBe(360)
  })

  it('answers null averages when the window holds no ticket', async () => {
    const evaluations = await resolveDashboardEvaluations(
      db,
      new Date('2026-01-05T10:00:00Z'),
    )

    expect(evaluations.tickets).toBe(0)
    expect(evaluations.averageReviewMinutes).toBeNull()
    expect(evaluations.averageProcessingMinutes).toBeNull()
  })

  it('resolves the on-call tile from a confirmed shift', async () => {
    const onCall = await resolveOnCallTile(db, now)

    expect(onCall).toMatchObject({
      kind: 'confirmed',
      name: 'Muster, Max',
      phone: null,
      warning: null,
    })
    expect(onCall?.endsAt).toBe('2026-03-10T12:00:00.000Z')
  })

  it('resolves channel status from the outbox', async () => {
    const channels = await resolveChannelStatus(db)

    expect(channels).toHaveLength(2)
    expect(channels?.find((c) => c.name === 'ntfy')).toMatchObject({
      lastSentAt: '2026-03-10T09:00:00.000Z',
      lastFailedAt: null,
      pending: 0,
      failed: 0,
    })
    expect(channels?.find((c) => c.name === 'smtp')).toMatchObject({
      lastSentAt: null,
      lastFailedAt: '2026-03-10T09:30:00.000Z',
      pending: 1,
      failed: 1,
    })
  })

  it('resolves burning now ordered by nearest deadline', async () => {
    const burning = await resolveBurningNow(db)

    expect(burning).toHaveLength(3)
    const [first, second, third] = burning

    expect(onlyRow(first, 'first burning row').ticketNo).toBe('ST-2026-0001')
    expect(onlyRow(second, 'second burning row').ticketNo).toBe('ST-2026-0005')
    expect(onlyRow(third, 'third burning row').ticketNo).toBe('ST-2026-0002')
  })

  it('builds the full snapshot', async () => {
    const snapshot = await buildDashboardSnapshot(db, { now })

    expect(snapshot.generatedAt).toBe(now.toISOString())
    expect(snapshot.faultFree).toMatchObject({
      since: '2026-03-10T08:00:00.000Z',
      days: 0,
      recordDays: 1,
    })
    expect(snapshot.evaluations).toMatchObject({
      windowDays: 30,
      tickets: 4,
      averageReviewMinutes: 60,
      averageFirstResponseMinutes: 90,
      averageAcknowledgeMinutes: 90,
      averageProcessingMinutes: 360,
    })
    expect(snapshot.tiles.open).toBe(4)
    expect(snapshot.tiles.overdue).toBe(1)
    expect(snapshot.tiles.poolSize).toBe(1)
    expect(snapshot.tiles.onCall?.kind).toBe('confirmed')
    expect(snapshot.tiles.channels).toHaveLength(2)
    expect(snapshot.burningNow).toHaveLength(3)
  })

  it('omits optional sections when not requested', async () => {
    const snapshot = await buildDashboardSnapshot(db, {
      now,
      includeOnCall: false,
      includeChannels: false,
    })

    expect(snapshot.tiles.onCall).toBeNull()
    expect(snapshot.tiles.channels).toBeNull()
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })
})
