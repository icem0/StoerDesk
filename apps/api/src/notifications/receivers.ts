import { and, eq, inArray } from 'drizzle-orm'

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
 * The ntfy recipients of an event per user (`specs/10-notifications.md` §11.3,
 * §11.4, §11.5, WP-M14-45): a user who selected a channel for an event type
 * receives the event at the address of the own account. Returns one entry per
 * user with a stored ntfy topic, deduplicated by topic — a repeated selection
 * never delivers twice; an empty answer keeps the instance chain of §11.1.
 */
export interface NtfyRecipient {
  userId: string
  topic: string
}

export async function ntfyRecipients(
  database: DbSelect,
  eventType: string,
): Promise<NtfyRecipient[]> {
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

  const recipients: NtfyRecipient[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (row.externalId === '' || row.externalId === null || seen.has(row.externalId)) {
      continue
    }

    seen.add(row.externalId)
    recipients.push({ userId: row.userId, topic: row.externalId })
  }

  return recipients
}

/**
 * The own topics of a list of users (`specs/10-notifications.md` §11.3, §11.4,
 * `specs/07-escalation.md` §7.14, ADR-0026, WP-M14-82b): the stored topic
 * (`external_id`) of every user of the list who selected the ntfy channel for
 * the event type — the broadcast of a distribution reaches the technicians of
 * the target on their own topics, never the instance topic. The user id comes
 * with the topic, so the caller can record the message for the addressee
 * (WP-M14-120b). A user without an ntfy account contributes nothing; the
 * topics are deduplicated.
 */
export async function ntfyTopicsOfUsers(
  database: DbSelect,
  eventType: string,
  userIds: readonly string[],
): Promise<NtfyRecipient[]> {
  if (userIds.length === 0) {
    return []
  }

  const rows = await database
    .select({
      userId: notificationPreferences.userId,
      externalId: notificationAccounts.externalId,
    })
    .from(notificationPreferences)
    .innerJoin(
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
        inArray(notificationPreferences.userId, userIds),
      ),
    )

  const recipients: NtfyRecipient[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (row.externalId === '' || row.externalId === null || seen.has(row.externalId)) {
      continue
    }

    seen.add(row.externalId)
    recipients.push({ userId: row.userId, topic: row.externalId })
  }

  return recipients
}
