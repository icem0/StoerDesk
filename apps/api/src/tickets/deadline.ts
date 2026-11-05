import { inArray } from 'drizzle-orm'

import {
  DEADLINE_HOURS,
  deadlineAtFor,
  TICKET_PRIORITIES,
  type TicketPriority,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * Effective deadline hours per priority (`specs/05-timeline.md` §5.1,
 * ADR-0008). The shared defaults are the fallback; a `settings` row
 * `ticket.deadline_hours.<priority>` overrides one value when it holds a positive
 * finite number (a bare JSON number or `{ hours }`).
 */

type Db = Database['database']

function overrideHours(value: unknown): number | undefined {
  const candidate =
    typeof value === 'number'
      ? value
      : value !== null && typeof value === 'object'
        ? (value as { hours?: unknown }).hours
        : undefined

  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined
}

export async function readDeadlineHours(database: Db): Promise<Record<TicketPriority, number>> {
  const keys = TICKET_PRIORITIES.map((priority) => `ticket.deadline_hours.${priority}`)
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys))

  const hours: Record<TicketPriority, number> = { ...DEADLINE_HOURS }

  for (const row of rows) {
    const priority = row.key.slice('ticket.deadline_hours.'.length) as TicketPriority

    if (!TICKET_PRIORITIES.includes(priority)) {
      continue
    }

    const value = overrideHours(row.value)

    if (value !== undefined) {
      hours[priority] = value
    }
  }

  return hours
}

/** Deadline from a trusted base timestamp and the effective per-priority hours. */
export async function deadlineAtForPriority(
  database: Db,
  base: Date,
  priority: string,
): Promise<Date> {
  return deadlineAtFor(base, priority, await readDeadlineHours(database))
}
