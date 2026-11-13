import { asc, eq } from 'drizzle-orm'
import type {
  NotificationChannelKind,
  NotificationEventType,
  NotificationPreferenceEntry,
  UpdateNotificationPreferencesRequest,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationPreferences } from '../db/schema'

/**
 * The selection of the channels per event type (`specs/10-notifications.md`
 * §11.4, WP-M14-16, ADR-0021): one row per user, event type and channel in
 * `notification_preferences`. A user without a row for an event type is
 * notified through the channels of the instance (the chain of §11.1). The
 * selection belongs to the user of the session — the user id is part of every
 * predicate, so the selection of another user is never read or written.
 */

type Db = Database['database']

/** The columns of the selection; the user id is the key, never the answer. */
const preferenceColumns = {
  eventType: notificationPreferences.eventType,
  channel: notificationPreferences.channel,
}

/** The selection of one user, ordered by event type and channel. */
export async function readPreferences(
  database: Db,
  userId: string,
): Promise<NotificationPreferenceEntry[]> {
  const rows = await database
    .select(preferenceColumns)
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .orderBy(
      asc(notificationPreferences.eventType),
      asc(notificationPreferences.channel),
    )

  return rows.map((row) => ({
    eventType: row.eventType as NotificationEventType,
    channel: row.channel as NotificationChannelKind,
  }))
}

/**
 * Replaces the selection of one user: the rows of the user are deleted and the
 * given selection is written in one transaction. A row is unique over
 * `(event_type, channel)` — a repeated pair is written once. The rows of
 * another user are outside both predicates and stay untouched.
 */
export async function writePreferences(
  database: Db,
  userId: string,
  selection: UpdateNotificationPreferencesRequest['preferences'],
): Promise<void> {
  const seen = new Set<string>()
  const rows: typeof notificationPreferences.$inferInsert[] = []

  for (const entry of selection) {
    const key = `${entry.eventType}:${entry.channel}`

    if (!seen.has(key)) {
      seen.add(key)
      rows.push({ userId, eventType: entry.eventType, channel: entry.channel })
    }
  }

  await database.transaction(async (tx) => {
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId))

    if (rows.length > 0) {
      await tx.insert(notificationPreferences).values(rows)
    }
  })
}
