import { and, asc, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type {
  NotificationAccount,
  NotificationChannelKind,
  StoreNotificationAccountRequest,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationAccounts } from '../db/schema'

/**
 * The accounts of the users (`specs/10-notifications.md` §11.3, WP-M14-08): the
 * link between a user and a channel, at most one per `(user_id, channel)`. The
 * secret of an account is write-only — it is stored, never answered, never
 * logged and never part of an event payload (ADR-0005 rule, §11.13). An answer
 * reports `secretSet` instead.
 */

type Db = Database['database']

/** 128 random bits of the topic (ADR-0024 point 6). */
const NTFY_TOPIC_RANDOM_BYTES = 16

/**
 * A new ntfy topic (ADR-0024 point 6, WP-M14-72): `stoerdesk-` plus 128 random
 * bits as hex. The topic is the secret of the subscription — never a user id —
 * and it matches the `stoerdesk-*` read entry of the access control list that
 * the setup script of WP-M14-70 creates.
 */
export function newNtfyTopic(): string {
  return `stoerdesk-${randomBytes(NTFY_TOPIC_RANDOM_BYTES).toString('hex')}`
}

/** One stored account as the service reads it — the secret stays inside. */
interface AccountRow {
  channel: string
  externalId: string
  label: string
  secret: string
}

/** The columns the service reads; the secret never leaves `toAccount`. */
const accountColumns = {
  channel: notificationAccounts.channel,
  externalId: notificationAccounts.externalId,
  label: notificationAccounts.label,
  secret: notificationAccounts.secret,
}

/** Maps a stored row to the public answer without the write-only secret. */
function toAccount(row: AccountRow): NotificationAccount {
  return {
    channel: row.channel as NotificationChannelKind,
    externalId: row.externalId,
    label: row.label,
    secretSet: row.secret !== '',
  }
}

/** Reads the stored row of one user and channel, or `undefined`. */
async function readAccount(
  database: Db,
  userId: string,
  channel: string,
): Promise<AccountRow | undefined> {
  const [row] = await database
    .select(accountColumns)
    .from(notificationAccounts)
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        eq(notificationAccounts.channel, channel),
      ),
    )
    .limit(1)

  return row
}

/** The accounts of one user, ordered by channel; never carries a secret. */
export async function listAccounts(
  database: Db,
  userId: string,
): Promise<NotificationAccount[]> {
  const rows = await database
    .select(accountColumns)
    .from(notificationAccounts)
    .where(eq(notificationAccounts.userId, userId))
    .orderBy(asc(notificationAccounts.channel))

  return rows.map(toAccount)
}

/**
 * Stores the account of a user — an upsert over the unique `(user_id, channel)`
 * key replaces the stored account. A missing or empty secret keeps the stored
 * one; only a non-empty secret replaces it. An ntfy account with an empty
 * `externalId` gets its topic from `newNtfyTopic()` (WP-M14-72): the server
 * creates the secret subscription topic, the client never picks it. The answer
 * carries `secretSet` and never the secret.
 */
export async function storeAccount(
  database: Db,
  userId: string,
  account: StoreNotificationAccountRequest,
): Promise<NotificationAccount> {
  const updatedAt = new Date()
  const externalId =
    account.channel === 'ntfy' && account.externalId === ''
      ? newNtfyTopic()
      : account.externalId
  const values: typeof notificationAccounts.$inferInsert = {
    userId,
    channel: account.channel,
    externalId,
    label: account.label ?? '',
    updatedAt,
  }
  const set: Partial<typeof notificationAccounts.$inferInsert> = {
    externalId,
    label: account.label ?? '',
    updatedAt,
  }

  if (account.secret !== undefined && account.secret !== '') {
    values.secret = account.secret
    set.secret = account.secret
  }

  await database
    .insert(notificationAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationAccounts.userId, notificationAccounts.channel],
      set,
    })

  const row = await readAccount(database, userId, account.channel)

  if (row === undefined) {
    throw new Error('account_not_stored')
  }

  return toAccount(row)
}

/**
 * Removes the own account of a channel. The user id is part of the predicate,
 * so an account of another user can never be deleted.
 */
export async function deleteAccount(
  database: Db,
  userId: string,
  channel: NotificationChannelKind,
): Promise<boolean> {
  const removed = await database
    .delete(notificationAccounts)
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        eq(notificationAccounts.channel, channel),
      ),
    )
    .returning({ id: notificationAccounts.id })

  return removed.length > 0
}
