import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * The silence of a user (`specs/10-notifications.md` §11.17, ADR-0048): the
 * user mutes the alarm for **one hour**. The silence follows the user and not
 * the device — the end of the silence lives on the server, in the row
 * `notifications.mute.<userId>` of the settings table (the same write-only
 * place the pending codes of the confirmation live, §11.3a).
 *
 * The silence silences the **sound only**: the band of the alarm and the bell
 * keep shining while unhandled messages exist.
 */

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>

/** How long a mute lasts. */
export const MUTE_DURATION_MS = 60 * 60 * 1000

/** The key of the settings row that holds the silence of a user. */
const muteKey = (userId: string): string => `notifications.mute.${userId}`

/**
 * The end of the silence of a user, or `null` while the alarm is audible. A
 * silence in the past is no silence.
 */
export async function readMuteUntil(
  database: DbSelect,
  userId: string,
): Promise<string | null> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, muteKey(userId)))
    .limit(1)

  const value = row?.value

  if (value === null || value === undefined || typeof value !== 'object') {
    return null
  }

  const { mutedUntil } = value as Record<string, unknown>

  if (typeof mutedUntil !== 'string' || mutedUntil === '') {
    return null
  }

  const deadline = Date.parse(mutedUntil)

  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    return null
  }

  return new Date(deadline).toISOString()
}

/**
 * Mutes the alarm of a user for one hour and answers the end of the silence.
 * A mute that is still running is not extended — the user asked for an hour,
 * not for an hour after every click.
 */
export async function muteForOneHour(
  database: Db,
  userId: string,
): Promise<string> {
  const current = await readMuteUntil(database, userId)
  const now = Date.now()
  const deadline =
    current !== null && Date.parse(current) > now ? Date.parse(current) : now + MUTE_DURATION_MS
  const mutedUntil = new Date(deadline).toISOString()

  await database
    .insert(settings)
    .values({ key: muteKey(userId), value: { mutedUntil } })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { mutedUntil }, updatedAt: new Date() },
    })

  return mutedUntil
}
