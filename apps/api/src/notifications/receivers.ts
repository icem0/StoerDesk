import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import type { NotificationChannelKind } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationAccounts, pushSubscriptions } from '../db/schema'
import { configuredChannels, emailEnvironment } from './channels'
import { readEmailChannelConfiguration } from './config'

/**
 * The channels of the users (`specs/10-notifications.md` §11.3, §11.4, ADR-0045):
 * a user has channels, not a selection per event type. The channels of a user
 * are his **confirmed** accounts — the account whose address the user proved
 * with a one-time code (§11.3a) — and his web-push devices.
 *
 * A channel that is only linked does not take part: an address that was never
 * confirmed is an address that may not work, and a message to it would be lost
 * without a trace. The target of the user travels with the channel — the topic
 * of the user, the chat of the user, the room of the user, the address of the
 * user — and the drain hands it to the adapter (WP-M24-06b).
 *
 * Only machine keys and the target of the user leave this module — never a
 * secret and never contact data (§11.13).
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

/** One channel of a user with the target of the user at that channel. */
export interface UserChannel {
  /** The owner of the channel. */
  userId: string
  /** The kind of the channel. */
  channel: NotificationChannelKind
  /**
   * The address of the user at the channel: the topic of the ntfy, the chat id
   * of Telegram, the room of Matrix, the address of the e-mail, the chat id of
   * the bridge. Empty for the web push — its target is the device of the user.
   */
  target: string
}

/**
 * The confirmed channels of one user (`specs/10-notifications.md` §11.3a,
 * ADR-0045): one entry per confirmed account and one for the web push while
 * the user has a device. An account without a confirmation is not a channel of
 * the user.
 */
export async function userChannels(
  database: DbSelect,
  userId: string,
): Promise<UserChannel[]> {
  const accounts = await database
    .select({
      channel: notificationAccounts.channel,
      externalId: notificationAccounts.externalId,
      target: notificationAccounts.target,
    })
    .from(notificationAccounts)
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        isNotNull(notificationAccounts.verifiedAt),
      ),
    )

  const channels: UserChannel[] = accounts.map((account) => ({
    userId,
    channel: account.channel as NotificationChannelKind,
    target: account.target !== '' ? account.target : account.externalId,
  }))

  const devices = await database
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1)

  if (devices.length > 0) {
    channels.push({ userId, channel: 'webpush', target: '' })
  }

  return channels
}

/**
 * The recipients of a personal message with the way the message takes
 * (`specs/10-notifications.md` §11.4, ADR-0037, ADR-0045): the target of the
 * action names the recipient, the channels of the recipient decide the way.
 * Every confirmed channel of every recipient is one entry — a recipient
 * without a confirmed channel contributes nothing, and the message then goes
 * over the chain of the installation (the fallback of §11.7).
 *
 * Only machine keys and the target of the user leave this module — never a
 * secret and never contact data (§11.13).
 */
export async function personalRecipients(
  database: DbSelect,
  userIds: readonly string[],
  env?: Env,
): Promise<UserChannel[]> {
  if (userIds.length === 0) {
    return []
  }

  const accounts = await database
    .select({
      userId: notificationAccounts.userId,
      channel: notificationAccounts.channel,
      externalId: notificationAccounts.externalId,
      target: notificationAccounts.target,
    })
    .from(notificationAccounts)
    .where(
      and(
        inArray(notificationAccounts.userId, userIds),
        isNotNull(notificationAccounts.verifiedAt),
      ),
    )

  const recipients: UserChannel[] = accounts.map((account) => ({
    userId: account.userId,
    channel: account.channel as NotificationChannelKind,
    target: account.target !== '' ? account.target : account.externalId,
  }))

  const devices = await database
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds))

  const withDevice = new Set(devices.map((device) => device.userId))

  for (const userId of withDevice) {
    recipients.push({ userId, channel: 'webpush', target: '' })
  }

  // The fallback of the delivery (§11.7, ADR-0045): a user without a confirmed
  // channel is notified over the chain of the installation — a message never
  // stays in the queue because a user has no channel of his own. The chain
  // carries the saved configuration of the administration: the mailbox of the
  // office is a channel of the chain like every other configured channel
  // (ADR-0046, WP-M41-02).
  if (env !== undefined) {
    const email = await readEmailChannelConfiguration(database, env)
    const chain = configuredChannels(emailEnvironment(env, email))

    for (const userId of userIds) {
      if (recipients.some((recipient) => recipient.userId === userId)) {
        continue
      }

      for (const channel of chain) {
        recipients.push({
          userId,
          channel: channel.name as NotificationChannelKind,
          target: '',
        })
      }
    }
  }

  return recipients
}
