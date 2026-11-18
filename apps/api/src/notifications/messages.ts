import { and, count, desc, eq, isNull, not } from 'drizzle-orm'
import {
  type NotificationMessageFilter,
  type NotificationMessageItem,
  type NotificationRecipientSummary,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationMessages, users } from '../db/schema'

type Db = Database['database']

/**
 * The scope of the message list (`specs/10-notifications.md` §11.16, WP-M14-141b):
 * whose messages the answer holds and whether the answer may name the
 * addressee.
 *
 * `userId` is `null` for the messages of **every** user — only the permission
 * `notification.read_all` asks for that scope. `withRecipient` decides whether
 * the answer names the addressee of a row; without the permission the
 * addressee stays `null`, so the inbox of a user never names another user.
 */
export type MessageScope = {
  /** The user whose messages the answer holds; `null` means every user. */
  userId: string | null
  /** The filters of the answer without the filter of the addressee. */
  filter: NotificationMessageFilter
  limit: number
  offset: number
  withRecipient: boolean
}

/** The name of a user: the given and the family name, else the e-mail. */
function displayName(givenName: string, familyName: string, email: string): string {
  const name = `${givenName} ${familyName}`.trim()

  return name === '' ? email : name
}

/**
 * The conditions of the filter (§11.16). The filter of the addressee is not
 * part of them: the scope carries it, and the list of the addressees applies
 * every other filter but not the addressee, so the list stays complete while
 * the filter of the addressee is active.
 */
function filterConditions(filter: NotificationMessageFilter) {
  const conditions = []

  if (filter.channel !== undefined) {
    conditions.push(eq(notificationMessages.channel, filter.channel))
  }

  if (filter.eventType !== undefined) {
    conditions.push(eq(notificationMessages.eventType, filter.eventType))
  }

  if (filter.state !== undefined) {
    conditions.push(eq(notificationMessages.state, filter.state))
  }

  if (filter.unread === true) {
    conditions.push(isNull(notificationMessages.readAt))
  }

  if (filter.unread === false) {
    conditions.push(not(isNull(notificationMessages.readAt)))
  }

  return conditions
}

/**
 * The messages of the scope, the newest first. Every row carries its addressee
 * — the route drops it without the permission `notification.read_all`.
 */
export async function readMessages(
  database: Db,
  scope: MessageScope,
): Promise<NotificationMessageItem[]> {
  const conditions = filterConditions(scope.filter)

  if (scope.userId !== null) {
    conditions.unshift(eq(notificationMessages.userId, scope.userId))
  }

  const rows = await database
    .select({
      id: notificationMessages.id,
      channel: notificationMessages.channel,
      eventType: notificationMessages.eventType,
      state: notificationMessages.state,
      title: notificationMessages.title,
      body: notificationMessages.body,
      createdAt: notificationMessages.createdAt,
      readAt: notificationMessages.readAt,
      userId: notificationMessages.userId,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
    })
    .from(notificationMessages)
    .innerJoin(users, eq(users.id, notificationMessages.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(notificationMessages.createdAt))
    .limit(scope.limit)
    .offset(scope.offset)

  return rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    eventType: row.eventType,
    state: row.state as NotificationMessageItem['state'],
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    recipient: scope.withRecipient
      ? {
          userId: row.userId,
          name: displayName(row.givenName, row.familyName, row.email),
        }
      : null,
  }))
}

/**
 * The addressees of the filter with the number of their messages — the answer
 * to the question of the office: which messages arrived at which user. The
 * filter of the addressee is not applied here, so the list holds every
 * addressee of the other filters and stays complete while that filter is
 * active.
 */
export async function readRecipients(
  database: Db,
  scope: MessageScope,
): Promise<NotificationRecipientSummary[]> {
  if (!scope.withRecipient) {
    return []
  }

  const conditions = filterConditions(scope.filter)

  const rows = await database
    .select({
      userId: notificationMessages.userId,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
      messages: count(),
    })
    .from(notificationMessages)
    .innerJoin(users, eq(users.id, notificationMessages.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .groupBy(notificationMessages.userId, users.givenName, users.familyName, users.email)
    .orderBy(desc(count()), users.familyName, users.givenName)

  return rows.map((row) => ({
    userId: row.userId,
    name: displayName(row.givenName, row.familyName, row.email),
    count: Number(row.messages),
  }))
}
