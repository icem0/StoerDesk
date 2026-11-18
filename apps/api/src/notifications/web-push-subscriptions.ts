import { and, count, eq } from 'drizzle-orm'

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
