import { and, count, eq, inArray } from 'drizzle-orm'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { pushSubscriptions } from '../db/schema'
import { readChannelConfiguration } from './config'

type Db = Database['database']

/** One browser subscription as the service worker hands it to the API. */
export interface WebPushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * The VAPID public key the browser needs to subscribe
 * (`specs/10-notifications.md` §11.1, WP-M14-124). Empty while the channel is
 * disabled or the key is missing, so the settings page can hide the action
 * instead of offering a subscription that can never be sent to.
 */
export async function readWebPushPublicKey(database: Db, env: Env): Promise<string> {
  const configurations = await readChannelConfiguration(database, env)
  const channel = configurations.find((configuration) => configuration.kind === 'webpush')

  if (channel === undefined || !channel.enabled) {
    return ''
  }

  return channel.config.publicKey ?? ''
}

/** How many devices the user has registered on this server. */
export async function countWebPushSubscriptions(database: Db, userId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  return Number(row?.value ?? 0)
}

/**
 * Stores one device for the user. The endpoint identifies the browser, not the
 * login: a repeated subscription of the same device replaces the old row, and
 * a second user on a shared device takes the endpoint over. That keeps the
 * drain from sending the same notification twice to one browser.
 */
export async function storeWebPushSubscription(
  database: Db,
  userId: string,
  input: WebPushSubscriptionInput,
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint))
    await tx.insert(pushSubscriptions).values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    })
  })
}

/**
 * Whether the server still holds the row of this device of this user
 * (`specs/10-notifications.md` §11.3, WP-M14-144). The browser knows its own
 * subscription, the server knows its rows — only both together say whether a
 * push can arrive: a dead device, a restored database or a shared device of
 * another user leaves a browser with a subscription the server never sends to.
 */
export async function hasWebPushSubscription(
  database: Db,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1)

  return rows.length > 0
}

/**
 * Removes one device of the user. Only the own endpoint is removed — an
 * endpoint of another user answers `false` and stays untouched.
 */
export async function deleteWebPushSubscription(
  database: Db,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const removed = await database
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id })

  return removed.length > 0
}

/**
 * Removes the devices the push service rejected as dead (`specs/10-notifications.md`
 * §11.15, ADR-0028): the browser revoked the notification permission, the browser
 * was reinstalled or the subscription expired. The rows are the defect, a retry
 * would never reach them. The endpoints are capability urls and never enter a log
 * line; the user of a removed row registers this browser again with the card of
 * WP-M14-126a. The answer is the number of the removed rows.
 */
export async function pruneDeadWebPushSubscriptions(
  database: Db,
  endpoints: readonly string[],
): Promise<number> {
  if (endpoints.length === 0) {
    return 0
  }

  const removed = await database
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.endpoint, [...endpoints]))
    .returning({ id: pushSubscriptions.id })

  return removed.length
}
