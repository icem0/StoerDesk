import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { notificationAccounts, notificationPreferences } from '../db/schema'

/**
 * The recipients of an event per user (`specs/10-notifications.md` §11.3,
 * §11.4, WP-M14-45): a user who selected a channel for an event type receives
 * the event at the address of the own account. The ntfy topic of a user is
 * derived from the user id (`stoerdesk-<userId>`); a stored ntfy account wins
 * over the derived topic (WP-M14-13). Only machine keys and the topic of a user
 * leave this module — never a secret and never contact data (§11.13).
 */

type DbSelect = Pick<Database['database'], 'select'>

/** The topic of a user, derived from the user id (§11.3, `stoerdesk-<userId>`). */
export function userTopic(userId: string): string {
  return `stoerdesk-${userId}`
}

/**
 * The ntfy topics of the users who selected `channel = 'ntfy'` for the event
 * type of §11.4. A stored ntfy account (`external_id`) wins over the derived
 * topic. The topics are deduplicated so a repeated selection never delivers
 * twice; an empty answer keeps the instance chain of §11.1.
 */
export async function ntfyRecipients(
  database: DbSelect,
  eventType: string,
): Promise<string[]> {
  const rows = await database
    .select({
      userId: notificationPreferences.userId,
      externalId: notificationAccounts.externalId,
    })
    .from(notificationPreferences)
    .leftJoin(
      notificationAccounts,
      and(
        eq(notificationAccounts.userId, notificationPreferences.userId),
        eq(notificationAccounts.channel, 'ntfy'),
      ),
    )
    .where(
      and(
        eq(notificationPreferences.eventType, eventType),
        eq(notificationPreferences.channel, 'ntfy'),
      ),
    )

  const topics = rows.map((row) =>
    row.externalId !== null && row.externalId !== ''
      ? row.externalId
      : userTopic(row.userId),
  )

  return [...new Set(topics)]
}
