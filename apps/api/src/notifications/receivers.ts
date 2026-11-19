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
 * One recipient of an escalation with the way the message takes
 * (`specs/07-escalation.md` §7.5, `specs/10-notifications.md` §11.4, ADR-0037).
 */
export interface EscalationRecipient {
  /** The addressee of the message. */
  userId: string
  /** The channel the recipient chose for the event type. */
  channel: string
  /** The own ntfy topic of the recipient — empty for every other channel. */
  topic: string
}

/**
 * The recipients of an escalation with their way (`specs/07-escalation.md`
 * §7.5, `specs/10-notifications.md` §11.4, ADR-0037): the target of the action
 * names the recipient, the recipient names the way. Every recipient gets one
 * entry per channel they selected for the event type
 * (`notification_preferences`); a recipient **without** a selection keeps the
 * personal fallback of ADR-0037 — their own ntfy topic
 * (`notification_accounts`) — and a recipient without an ntfy account contributes
 * nothing. The action never becomes a broadcast: a target addresses people.
 *
 * Only machine keys and the topic of a user leave this module — never a secret
 * and never contact data (§11.13).
 */
export async function escalationRecipients(
  database: DbSelect,
  eventType: string,
  userIds: readonly string[],
): Promise<EscalationRecipient[]> {
  if (userIds.length === 0) {
    return []
  }

  const [selections, accounts] = await Promise.all([
    database
      .select({
        userId: notificationPreferences.userId,
        channel: notificationPreferences.channel,
      })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.eventType, eventType),
          inArray(notificationPreferences.userId, userIds),
        ),
      ),
    database
      .select({
        userId: notificationAccounts.userId,
        externalId: notificationAccounts.externalId,
      })
      .from(notificationAccounts)
      .where(
        and(
          eq(notificationAccounts.channel, 'ntfy'),
          inArray(notificationAccounts.userId, userIds),
        ),
      ),
  ])

  const topicByUser = new Map<string, string>()

  for (const account of accounts) {
    if (account.externalId !== '' && !topicByUser.has(account.userId)) {
      topicByUser.set(account.userId, account.externalId)
    }
  }

  const channelsByUser = new Map<string, string[]>()

  for (const selection of selections) {
    const channels = channelsByUser.get(selection.userId) ?? []

    if (!channels.includes(selection.channel)) {
      channels.push(selection.channel)
    }

    channelsByUser.set(selection.userId, channels)
  }

  const recipients: EscalationRecipient[] = []
  const seen = new Set<string>()

  for (const userId of userIds) {
    const channels = channelsByUser.get(userId) ?? []
    const topic = topicByUser.get(userId) ?? ''

    if (channels.length === 0) {
      // Without a selection the recipient keeps their own ntfy topic
      // (ADR-0037); without an ntfy account there is no personal way left.
      if (topic === '') {
        continue
      }

      recipients.push({ userId, channel: 'ntfy', topic })
      continue
    }

    for (const channel of channels) {
      const key = `${userId}:${channel}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      recipients.push({ userId, channel, topic: channel === 'ntfy' ? topic : '' })
    }
  }

  return recipients
}
