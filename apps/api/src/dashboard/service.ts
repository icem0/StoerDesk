import { sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import { TICKET_STATUSES } from '../db/schema'
import { resolveOnCallPerson } from '../oncall/coupling'
import {
  dashboardSnapshotSchema,
  type DashboardSnapshot,
  type TicketPriority,
  type TicketStatus,
} from '@stoerdesk/shared'

type Db = Database['database']

const MS_PER_DAY = 24 * 60 * 60 * 1000
const BERLIN_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Berlin wall-clock calendar date of an instant, as `YYYY-MM-DD`. */
function berlinDateKey(instant: Date): string {
  return BERLIN_DATE_FMT.format(instant)
}

/** Whole local days (`Europe/Berlin`) from `from` to `to`, comparing Berlin
 * calendar dates so DST transitions are handled correctly. */
function berlinDaysBetween(from: Date, to: Date): number {
  const startFrom = Date.parse(berlinDateKey(from) + 'T00:00:00Z')
  const startTo = Date.parse(berlinDateKey(to) + 'T00:00:00Z')
  return Math.max(0, Math.floor((startTo - startFrom) / MS_PER_DAY))
}

/** Coerce a database timestamp value (Date or ISO string) to a valid Date. */
function asDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date : null
}

/** Newest qualifying `reported_at` and the whole local days since it. */
export async function resolveFaultFreeCounter(
  database: Db,
  now: Date,
): Promise<{ since: string | null; days: number }> {
  const rows = (await database.execute(sql`
    SELECT MAX(reported_at) AS max_reported_at
    FROM stats_tickets
    WHERE is_test = false
      AND suspected_spam = false
      AND status <> 'CANCELLED'
  `)) as { max_reported_at: Date | null }[]

  const row = rows[0]
  const since = asDate(row?.max_reported_at ?? null)
  const days = since ? berlinDaysBetween(since, now) : 0
  return { since: since ? since.toISOString() : null, days }
}

/** Longest gap between two consecutive qualifying reports in report order.
 * A still-running gap counts while it is the longest. Computed, never stored. */
export async function resolveFaultFreeRecord(database: Db, now: Date): Promise<number> {
  const rows = (await database.execute(sql`
    SELECT reported_at
    FROM stats_tickets
    WHERE is_test = false
      AND suspected_spam = false
      AND status <> 'CANCELLED'
    ORDER BY reported_at ASC
  `)) as { reported_at: Date }[]

  let recordDays = 0
  let previous: Date | null = null

  for (const row of rows) {
    const reported = asDate(row.reported_at)
    if (!reported) {
      continue
    }
    const key = berlinDateKey(reported)
    if (previous !== null) {
      const startPrev = Date.parse(berlinDateKey(previous) + 'T00:00:00Z')
      const startKey = Date.parse(key + 'T00:00:00Z')
      recordDays = Math.max(recordDays, Math.floor((startKey - startPrev) / MS_PER_DAY))
    }
    previous = reported
  }

  if (previous !== null) {
    recordDays = Math.max(recordDays, berlinDaysBetween(previous, now))
  }

  return recordDays
}

type BaseTiles = {
  open: number
  openByStatus: Record<string, number>
  overdue: number
  unreviewed: number
  poolSize: number
}

export async function resolveDashboardTiles(database: Db, now: Date): Promise<BaseTiles> {
  const openByStatusRows = (await database.execute(sql`
    SELECT status, COUNT(*) AS cnt
    FROM stats_tickets
    WHERE status NOT IN ('CLOSED', 'CANCELLED')
    GROUP BY status
  `)) as { status: string; cnt: string }[]

  const openByStatus: Record<string, number> = {}
  let open = 0

  for (const row of openByStatusRows) {
    const cnt = Number(row.cnt)
    openByStatus[row.status] = cnt
    open += cnt
  }

  const openByStatusFilled: Record<string, number> = {}
  for (const status of TICKET_STATUSES) {
    openByStatusFilled[status] = openByStatus[status] ?? 0
  }

  const overdueRows = (await database.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM stats_tickets
    WHERE deadline_at < ${sql.raw(`'${now.toISOString()}'`)}::timestamptz
      AND status NOT IN ('CLOSED', 'CANCELLED')
  `)) as { cnt: string }[]

  const unreviewedRows = (await database.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM stats_tickets
    WHERE status = 'NEW'
  `)) as { cnt: string }[]

  const poolRows = (await database.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM stats_tickets
    WHERE status = 'OFFERED'
      AND assigned_user_id IS NULL
  `)) as { cnt: string }[]

  return {
    open,
    openByStatus: openByStatusFilled,
    overdue: Number(overdueRows[0]?.cnt ?? 0),
    unreviewed: Number(unreviewedRows[0]?.cnt ?? 0),
    poolSize: Number(poolRows[0]?.cnt ?? 0),
  }
}

type OnCallTile = NonNullable<NonNullable<DashboardSnapshot['tiles']>['onCall']>

export async function resolveOnCallTile(database: Db, now: Date): Promise<OnCallTile | null> {
  const resolution = await resolveOnCallPerson(database, { at: now })

  let name: string | null = null
  const phone: string | null = null

  if (resolution.userId !== undefined) {
    const userRows = (await database.execute(sql`
      SELECT given_name, family_name
      FROM users
      WHERE id = ${resolution.userId}
    `)) as { given_name: string; family_name: string }[]

    const user = userRows[0]

    if (user) {
      const family = String(user.family_name ?? '')
      const given = String(user.given_name ?? '')
      name = (family || given) ? `${family}, ${given}` : null
    }
  }

  const warning =
    resolution.kind === 'unstaffed'
      ? 'oncall_unstaffed'
      : resolution.kind === 'planned'
        ? 'oncall_unconfirmed'
        : null

  return {
    kind: resolution.kind,
    name,
    phone,
    endsAt: resolution.endsAt ? resolution.endsAt.toISOString() : null,
    warning,
  }
}

type ChannelTile = NonNullable<NonNullable<DashboardSnapshot['tiles']>['channels']>[number]

export async function resolveChannelStatus(database: Db): Promise<ChannelTile[] | null> {
  const rows = (await database.execute(sql`
    SELECT
      channel,
      MAX(CASE WHEN state = 'SENT' THEN created_at END) AS last_sent_at,
      MAX(CASE WHEN state = 'FAILED' THEN created_at END) AS last_failed_at,
      COUNT(*) FILTER (WHERE state = 'PENDING') AS pending,
      COUNT(*) FILTER (WHERE state = 'FAILED') AS failed
    FROM outbox
    GROUP BY channel
    ORDER BY channel
  `)) as {
    channel: string
    last_sent_at: Date | null
    last_failed_at: Date | null
    pending: string
    failed: string
  }[]

  if (rows.length === 0) {
    return null
  }

  return rows.map((row) => ({
    name: row.channel,
    lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
    lastFailedAt: row.last_failed_at ? new Date(row.last_failed_at).toISOString() : null,
    pending: Number(row.pending ?? 0),
    failed: Number(row.failed ?? 0),
  }))
}

type BurningNowRow = NonNullable<DashboardSnapshot['burningNow']>[number]

/** A burning-now row that additionally carries the object id for TV
 *  anonymisation (`specs/11-dashboard.md` §11.7). The `objectId` is stripped
 *  by `dashboardSnapshotSchema` before the snapshot leaves the dashboard API. */
type BurningNowRowWithId = BurningNowRow & { objectId: string }

export async function resolveBurningNow(
  database: Db,
): Promise<BurningNowRowWithId[]> {
  const rows = (await database.execute(sql`
    SELECT ticket_no, object_id, object_name, status, priority, deadline_at,
      reported_at
    FROM stats_tickets
    WHERE status NOT IN ('CLOSED', 'CANCELLED')
      AND is_test = false
    ORDER BY deadline_at ASC
    LIMIT 10
  `)) as {
    ticket_no: string
    object_id: string
    object_name: string
    status: string
    priority: string
    deadline_at: Date
    reported_at: Date
  }[]

  return rows.map((row) => ({
    ticketNo: row.ticket_no,
    objectName: row.object_name,
    objectId: row.object_id,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    deadlineAt: new Date(row.deadline_at).toISOString(),
    reportedAt: new Date(row.reported_at).toISOString(),
  }))
}

/** One dashboard snapshot, computed in the database (`specs/11-dashboard.md` §11.2).
 * Optional sections (`onCall`, `channels`) are `null` when the caller has no
 * permission for them; the snapshot never fails because a section is missing. */
export async function buildDashboardSnapshot(
  database: Db,
  input: { now: Date; includeOnCall?: boolean; includeChannels?: boolean },
): Promise<DashboardSnapshot> {
  const { now, includeOnCall = true, includeChannels = true } = input
  const { since, days } = await resolveFaultFreeCounter(database, now)
  const recordDays = await resolveFaultFreeRecord(database, now)
  const baseTiles = await resolveDashboardTiles(database, now)
  const onCall = includeOnCall ? await resolveOnCallTile(database, now) : null
  const channels = includeChannels ? await resolveChannelStatus(database) : null

  const tiles = {
    ...baseTiles,
    onCall,
    channels,
  }

  return dashboardSnapshotSchema.parse({
    generatedAt: now.toISOString(),
    faultFree: { since, days, recordDays },
    tiles,
    burningNow: await resolveBurningNow(database),
  })
}
