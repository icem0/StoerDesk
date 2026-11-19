import { eq, inArray, sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import { settings, users } from '../db/schema'

/**
 * The delivery problems of the channels (`specs/10-notifications.md` §11.8,
 * WP-M14-161a).
 *
 * A problem is a failed delivery that nobody acknowledged. The
 * acknowledgement is the *time* of the last quittature: a failure after that
 * time opens the problem again, so a solved problem stays solved and a new
 * one is never silent. The acknowledgement lives in the settings row
 * `notifications.delivery_acknowledged` — a map of the channel to the time
 * and to the user that acknowledged it.
 *
 * The times of this module are the times of the failure itself (`updated_at`
 * of the outbox row), not the time the row was queued: a delivery that was
 * queued before the quittature but failed after it is a new failure.
 */

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>

/** The settings row that carries the acknowledgement of the delivery problems. */
const DELIVERY_ACKNOWLEDGEMENTS_KEY = 'notifications.delivery_acknowledged'

/** How many lost messages the answer lists. */
const FAILURE_LIMIT = 50

/** The beginning of the time: the watermark of a channel nobody acknowledged. */
const EPOCH = new Date(0)

/** The acknowledgement of one channel: the time and the user that quit it. */
export type DeliveryAcknowledgement = { at: Date; by: string | null }

export type DeliveryProblem = {
  channel: string
  failed: number
  unacknowledged: number
  lastFailureAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  open: boolean
}

export type DeliveryFailure = {
  id: string
  channel: string
  eventType: string
  failedAt: string
  attempts: number
  error: string | null
  ticketNo: string | null
}

type ProblemRow = {
  channel: string
  failed: string
  last_failure_at: Date | null
  last_success_at: Date | null
  last_error: string | null
}

type FailureRow = {
  id: string
  channel: string
  event_type: string
  failed_at: Date
  attempts: number
  error: string | null
  ticket_no: string | null
}

/**
 * The acknowledgements of the channels (`notifications.delivery_acknowledged`).
 * A malformed row is ignored instead of failing the answer — a broken map
 * must never hide the problems of the channels.
 */
export async function readDeliveryAcknowledgements(
  database: DbSelect,
): Promise<Map<string, DeliveryAcknowledgement>> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, DELIVERY_ACKNOWLEDGEMENTS_KEY))
    .limit(1)

  const acknowledgements = new Map<string, DeliveryAcknowledgement>()
  const value = rows[0]?.value

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return acknowledgements
  }

  for (const [channel, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const record = entry as { at?: unknown; by?: unknown }
    const at = typeof record.at === 'string' ? new Date(record.at) : null

    if (at === null || Number.isNaN(at.getTime())) {
      continue
    }

    acknowledgements.set(channel, {
      at,
      by: typeof record.by === 'string' && record.by !== '' ? record.by : null,
    })
  }

  return acknowledgements
}

/** Writes the acknowledgements of the channels; the other channels stay untouched. */
export async function storeDeliveryAcknowledgements(
  database: Db,
  acknowledgements: Map<string, DeliveryAcknowledgement>,
): Promise<void> {
  const value: Record<string, { at: string; by: string | null }> = {}

  for (const [channel, acknowledgement] of acknowledgements) {
    value[channel] = { at: acknowledgement.at.toISOString(), by: acknowledgement.by }
  }

  await database
    .insert(settings)
    .values({ key: DELIVERY_ACKNOWLEDGEMENTS_KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
}

/** The failed deliveries of a channel that happened after the acknowledgement. */
async function countFailuresAfter(
  database: Db,
  channel: string,
  after: Date | null,
): Promise<number> {
  const rows = (await database.execute(sql`
    SELECT COUNT(*) AS count
    FROM outbox
    WHERE state = 'FAILED'
      AND channel = ${channel}
      AND updated_at > ${(after ?? EPOCH).toISOString()}::timestamptz
  `)) as { count: string }[]

  return Number(rows[0]?.count ?? 0)
}

/** The display names of the users that acknowledged a problem. */
async function readUserNames(
  database: DbSelect,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()

  if (ids.length === 0) {
    return names
  }

  const rows = await database
    .select({ id: users.id, family: users.familyName, given: users.givenName })
    .from(users)
    .where(inArray(users.id, ids))

  for (const row of rows) {
    const family = String(row.family ?? '')
    const given = String(row.given ?? '')

    names.set(row.id, family || given ? `${family}, ${given}` : row.id)
  }

  return names
}

/**
 * The delivery problems and the lost messages (`specs/10-notifications.md`
 * §11.8): per channel the failed deliveries, the failures nobody
 * acknowledged and the times of the last failure and the last success — plus
 * the failed rows of the outbox, the messages that never arrived.
 */
export async function readDeliveryProblems(database: Db): Promise<{
  problems: DeliveryProblem[]
  failures: DeliveryFailure[]
}> {
  const acknowledgements = await readDeliveryAcknowledgements(database)

  const rows = (await database.execute(sql`
    SELECT
      channel,
      COUNT(*) FILTER (WHERE state = 'FAILED') AS failed,
      MAX(CASE WHEN state = 'FAILED' THEN updated_at END) AS last_failure_at,
      MAX(CASE WHEN state = 'SENT' THEN updated_at END) AS last_success_at,
      MAX(CASE WHEN state = 'FAILED' THEN target->>'lastError' END) AS last_error
    FROM outbox
    GROUP BY channel
    ORDER BY channel
  `)) as ProblemRow[]

  const problems: DeliveryProblem[] = []
  const acknowledgedById = new Map<string, string>()

  for (const row of rows) {
    const failed = Number(row.failed ?? 0)

    if (failed === 0) {
      continue
    }

    const acknowledgement = acknowledgements.get(row.channel)
    const unacknowledged = await countFailuresAfter(
      database,
      row.channel,
      acknowledgement?.at ?? null,
    )

    if (acknowledgement?.by != null) {
      acknowledgedById.set(row.channel, acknowledgement.by)
    }

    problems.push({
      channel: row.channel,
      failed,
      unacknowledged,
      lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at).toISOString() : null,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      lastError: row.last_error ?? null,
      acknowledgedAt: acknowledgement?.at.toISOString() ?? null,
      acknowledgedBy: null,
      open: unacknowledged > 0,
    })
  }

  const names = await readUserNames(database, [...new Set(acknowledgedById.values())])

  for (const problem of problems) {
    const id = acknowledgedById.get(problem.channel)

    problem.acknowledgedBy = id === undefined ? null : (names.get(id) ?? id)
  }

  const failureRows = (await database.execute(sql`
    SELECT
      id,
      channel,
      event_type,
      updated_at AS failed_at,
      attempts,
      target->>'lastError' AS error,
      target->>'ticketNo' AS ticket_no
    FROM outbox
    WHERE state = 'FAILED'
    ORDER BY updated_at DESC
    LIMIT ${FAILURE_LIMIT}
  `)) as FailureRow[]

  const failures: DeliveryFailure[] = failureRows.map((row) => ({
    id: row.id,
    channel: row.channel,
    eventType: row.event_type,
    failedAt: new Date(row.failed_at).toISOString(),
    attempts: Number(row.attempts ?? 0),
    error: row.error ?? null,
    ticketNo: row.ticket_no ?? null,
  }))

  return { problems, failures }
}

/**
 * The quittature of the problems (`specs/10-notifications.md` §11.8): the
 * named channels, or every open problem when the list is missing or empty. A
 * channel without an open problem is not acknowledged again — the time of the
 * last quittature stays, so a later failure opens the problem again.
 */
export async function acknowledgeDeliveryProblems(
  database: Db,
  channels: string[] | undefined,
  userId: string,
  now: Date = new Date(),
): Promise<{ acknowledgedAt: Date; channels: string[] }> {
  const { problems } = await readDeliveryProblems(database)
  const wanted = problems.filter(
    (problem) =>
      problem.open && (channels === undefined || channels.length === 0
        ? true
        : channels.includes(problem.channel)),
  )

  if (wanted.length === 0) {
    return { acknowledgedAt: now, channels: [] }
  }

  const acknowledgements = await readDeliveryAcknowledgements(database)

  for (const problem of wanted) {
    acknowledgements.set(problem.channel, { at: now, by: userId })
  }

  await storeDeliveryAcknowledgements(database, acknowledgements)

  return { acknowledgedAt: now, channels: wanted.map((problem) => problem.channel) }
}
