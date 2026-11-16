import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { notificationAccounts, notificationPreferences } from '../db/schema'

/**
 * The recipients of an event per user (`specs/10-notifications.md` §11.3,
 * §11.4, §11.5, WP-M14-45): a user who selected a channel for an event type
 * receives the event at the address of the own account. The ntfy topic of a
 * user is the stored `external_id` of the account — a random secret of the
 * server (ADR-0024 point 6, WP-M14-72); a user without an ntfy account gets no
 * ntfy topic. Only machine keys and the topic of a user leave this module —
 * never a secret and never contact data (§11.13).
 */

type DbSelect = Pick<Database['database'], 'select'>

/**
 * The derived fallback topic of a user (`stoerdesk-<userId>`, §11.3) — kept for
 * the internal paths of `outbox.ts`; the recipient routing of this module never
 * derives a topic from a user id any more (WP-M14-72).
 */
export function userTopic(userId: string): string {
  return `stoerdesk-${userId}`
}

/**
 * The ntfy topics of the users who selected `channel = 'ntfy'` for the event
 * type of §11.4: the stored topic (`external_id`) of each of those users. A
 * user without a stored ntfy account contributes nothing (WP-M14-72) — the
 * fallback `stoerdesk-<userId>` is gone, the topic is the secret of the
 * subscription. The topics are deduplicated so a repeated selection never
 * delivers twice; an empty answer keeps the instance chain of §11.1.
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

  const topics = rows.map((row) => row.externalId ?? '').filter((topic) => topic !== '')

  return [...new Set(topics)]
}
