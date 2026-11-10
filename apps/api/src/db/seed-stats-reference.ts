import { sql } from 'drizzle-orm'

import { objects, tickets } from './schema'
import type { Database } from './client'

/**
 * Test-only reference data set for the phase-9 exit criterion
 * (`PLAN.md` §20 items 8 and 9, WP-M9-18).
 *
 * The set is deterministic and idempotent: every row has a fixed `client_uuid`
 * and is inserted only when it is missing, so a repeated run neither duplicates
 * rows nor changes the aggregates. The five real reports give the review phase
 * the minutes `10, 20, 30, 40, 60` whose median is
 * {@link REFERENCE_MEDIAN_REVIEW_MINUTES}. A later `is_test = true` ticket and a
 * later cancelled ticket must not reset the fault-free counter, but the test
 * can add a newer qualifying report to prove the reset.
 */

type Db = Database['database']

export const REFERENCE_OBJECT_NO = 'STATS-REF'

/** Printed reference value of `PLAN.md` §20 item 9 (minutes). */
export const REFERENCE_MEDIAN_REVIEW_MINUTES = 30

/** `reported_at` of the newest real, non-cancelled reference report. */
export const REFERENCE_LAST_QUALIFYING_REPORTED_AT = '2026-01-05T08:00:00.000Z'

const MINUTE = 60_000

function at(day: number, extraMinutes: number): Date {
  return new Date(Date.UTC(2026, 0, day, 8, 0, 0) + extraMinutes * MINUTE)
}

function fixedUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

async function ensureObject(database: Db): Promise<string> {
  const existing = (await database
    .select({ id: objects.id })
    .from(objects)
    .where(sql`lower(${objects.objectNo}) = lower(${REFERENCE_OBJECT_NO})`)
    .limit(1)) as { id: string }[]

  if (existing[0] !== undefined) {
    return existing[0].id
  }

  const inserted = (await database
    .insert(objects)
    .values({ objectNo: REFERENCE_OBJECT_NO, name: 'Statistik-Referenzobjekt' })
    .returning({ id: objects.id })) as { id: string }[]

  return inserted[0]!.id
}

type ReferenceTicket = {
  index: number
  day: number
  reviewMinutes: number | null
  status: string
  isTest: boolean
}

const REFERENCE_TICKETS: ReferenceTicket[] = [
  { index: 1, day: 1, reviewMinutes: 10, status: 'ACKNOWLEDGED', isTest: false },
  { index: 2, day: 2, reviewMinutes: 20, status: 'ACKNOWLEDGED', isTest: false },
  { index: 3, day: 3, reviewMinutes: 30, status: 'ACKNOWLEDGED', isTest: false },
  { index: 4, day: 4, reviewMinutes: 40, status: 'ACKNOWLEDGED', isTest: false },
  { index: 5, day: 5, reviewMinutes: 60, status: 'ACKNOWLEDGED', isTest: false },
  { index: 6, day: 6, reviewMinutes: null, status: 'NEW', isTest: true },
  { index: 7, day: 7, reviewMinutes: null, status: 'CANCELLED', isTest: false },
]

async function ensureTicket(database: Db, objectId: string, ticket: ReferenceTicket): Promise<void> {
  const clientUuid = fixedUuid(ticket.index)
  const existing = (await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(sql`${tickets.clientUuid} = ${clientUuid}`)
    .limit(1)) as { id: string }[]

  if (existing.length > 0) {
    return
  }

  const reportedAt = at(ticket.day, 0)
  const reviewStartedAt =
    ticket.reviewMinutes === null ? null : new Date(reportedAt.getTime() + ticket.reviewMinutes * MINUTE)
  const firstResponseAt =
    ticket.reviewMinutes === null ? null : new Date(reportedAt.getTime() + ticket.reviewMinutes * MINUTE)
  const acknowledgedAt =
    ticket.reviewMinutes === null ? null : new Date(reportedAt.getTime() + (ticket.reviewMinutes + 5) * MINUTE)

  await database.insert(tickets).values({
    clientUuid,
    objectId,
    status: ticket.status,
    priority: 'normal',
    source: 'QR',
    reportedAt,
    receivedAt: reportedAt,
    deadlineAt: new Date(reportedAt.getTime() + 60 * MINUTE),
    reviewStartedAt,
    firstResponseAt,
    acknowledgedAt,
    isTest: ticket.isTest,
  })
}

/**
 * Inserts the reference set idempotently and answers the object id. Real reports
 * carry an explicit `is_test = false`; the set also holds one `is_test = true`
 * ticket and one cancelled real ticket.
 */
export async function seedStatsReference(database: Db): Promise<{ objectId: string }> {
  const objectId = await ensureObject(database)

  for (const ticket of REFERENCE_TICKETS) {
    await ensureTicket(database, objectId, ticket)
  }

  return { objectId }
}

/** Day offset helper for a test that adds a newer qualifying report. */
export function referenceInstant(day: number): Date {
  return at(day, 0)
}
