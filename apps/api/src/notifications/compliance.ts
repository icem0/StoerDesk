import { and, eq, isNotNull } from 'drizzle-orm'

import type { ChannelPolicy, NotificationChannelKind } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationAccounts, pushSubscriptions, users } from '../db/schema'
import { readChannelPolicy } from '../settings/notifications'

/**
 * The compliance of the users (`specs/10-notifications.md` §11.9, ADR-0045):
 * for every user the state of his channels, the required channels he does not
 * have set up and the number of the channels he has set up.
 *
 * The answer names **the state of the channel, never the address of the user**
 * (§11.13): a topic, a chat id, a room or a mail address never reaches the
 * administration.
 */

type Db = Database['database']

/** The state of one channel of one user. */
export interface ChannelState {
  channel: NotificationChannelKind
  state: 'missing' | 'linked' | 'ready'
}

/** The compliance of one user. */
export interface UserCompliance {
  userId: string
  /** The display name of the user — the name, never the mail address. */
  name: string
  channels: ChannelState[]
  /** The required channels the user does not have set up. */
  missing: NotificationChannelKind[]
  /** How many channels the user has set up. */
  channelCount: number
  /** Whether the user fulfils the rule of the administration. */
  compliant: boolean
}

/** The kinds of the channels that a user can have (§11.1). */
const USER_CHANNEL_KINDS: NotificationChannelKind[] = [
  'ntfy',
  'telegram',
  'matrix',
  'email',
  'webpush',
  'whatsapp',
]

/**
 * The compliance of every user of the instance: the state of every channel of
 * every user, the required channels that are missing and the flag of the rule.
 * A user without an account has the state `missing` on every channel; an
 * account without a confirmation is `linked`; a confirmed account is `ready`.
 */
export async function readCompliance(database: Db): Promise<UserCompliance[]> {
  const policy = await readChannelPolicy(database)

  const [accounts, devices, people] = await Promise.all([
    database
      .select({
        userId: notificationAccounts.userId,
        channel: notificationAccounts.channel,
        verifiedAt: notificationAccounts.verifiedAt,
      })
      .from(notificationAccounts),
    database
      .select({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions),
    database
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        active: users.active,
      })
      .from(users)
      .where(eq(users.active, true)),
  ])

  const accountsByUser = new Map<string, Map<string, 'linked' | 'ready'>>()

  for (const account of accounts) {
    const channels = accountsByUser.get(account.userId) ?? new Map()
    channels.set(
      account.channel,
      account.verifiedAt === null ? 'linked' : 'ready',
    )
    accountsByUser.set(account.userId, channels)
  }

  const deviceUsers = new Set(devices.map((device) => device.userId))

  const compliance: UserCompliance[] = people.map((person) => {
    const channels = accountsByUser.get(person.id) ?? new Map<string, 'linked' | 'ready'>()

    if (deviceUsers.has(person.id)) {
      channels.set('webpush', 'ready')
    }

    const states: ChannelState[] = USER_CHANNEL_KINDS.map((channel) => ({
      channel,
      state: channels.get(channel) ?? 'missing',
    }))

    const ready = states.filter((state) => state.state === 'ready').length
    const missing = policy.requiredChannels.filter(
      (channel) => states.find((state) => state.channel === channel)?.state !== 'ready',
    )

    const name = `${person.givenName} ${person.familyName}`.trim()

    return {
      userId: person.id,
      name: name === '' ? '—' : name,
      channels: states,
      missing,
      channelCount: ready,
      compliant: missing.length === 0 && ready >= policy.minimumChannelCount,
    }
  })

  return compliance
}

/**
 * The compliance of one user — the own page needs it for the warning of §11.9.
 */
export async function readUserCompliance(
  database: Db,
  userId: string,
): Promise<UserCompliance | undefined> {
  const all = await readCompliance(database)

  return all.find((entry) => entry.userId === userId)
}

/**
 * The compliance of one user with the rule of the administration
 * (`specs/10-notifications.md` §11.9, §11.19, WP-M35-01): the own page names
 * the channels that are mandatory and the number of the channels that are
 * needed — so the answer carries the rule itself. A user without an entry in
 * the table of the users (a session of a user that was deleted meanwhile)
 * answers with an empty compliance instead of a broken answer.
 */
export async function readUserComplianceWithPolicy(
  database: Db,
  userId: string,
): Promise<UserCompliance & { policy: ChannelPolicy }> {
  const [compliance, policy] = await Promise.all([
    readUserCompliance(database, userId),
    readChannelPolicy(database),
  ])

  return {
    userId: compliance?.userId ?? userId,
    name: compliance?.name ?? '—',
    channels: compliance?.channels ?? [],
    missing: compliance?.missing ?? [],
    channelCount: compliance?.channelCount ?? 0,
    compliant: compliance?.compliant ?? true,
    policy,
  }
}

/** The confirmed accounts of a user — the helper of the own page. */
export async function readConfirmedChannels(
  database: Database['database'],
  userId: string,
): Promise<NotificationChannelKind[]> {
  const rows = await database
    .select({ channel: notificationAccounts.channel })
    .from(notificationAccounts)
    .where(
      and(
        eq(notificationAccounts.userId, userId),
        isNotNull(notificationAccounts.verifiedAt),
      ),
    )

  return rows.map((row) => row.channel as NotificationChannelKind)
}
