import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * Privacy retention settings (`specs/14-nfr.md` §15.2, ADR-0014 decision 1,
 * WP-M10-15).
 *
 * The two retention windows are stored as separate jsonb rows in the `settings`
 * table under `privacy.contact_retention_months` and
 * `privacy.photo_retention_months` and fall back to the 24-month defaults of
 * `PLAN.md` §15. `storePrivacyRetentionSettings` writes them; the admin settings
 * UI and the export/erasure routes come with WP-M10-16, this package only
 * provides the stored keys and the read the retention job uses.
 */

/** Settings keys of the two retention windows. */
export const CONTACT_RETENTION_MONTHS_KEY = 'privacy.contact_retention_months'
export const PHOTO_RETENTION_MONTHS_KEY = 'privacy.photo_retention_months'

/** Defaults of `PLAN.md` §15 when no row is configured. */
export const DEFAULT_RETENTION_MONTHS = 24

/**
 * A configured window is a whole number of months; a row below one month falls
 * back to the default so a misconfigured window can never anonymise live data.
 */
export const MINIMUM_RETENTION_MONTHS = 1

type Db = Database['database']

async function readSetting(database: Db, key: string): Promise<unknown> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)

  return rows[0]?.value
}

function retentionMonthsOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MINIMUM_RETENTION_MONTHS
    ? value
    : fallback
}

export type PrivacyRetentionSettings = {
  contactRetentionMonths: number
  photoRetentionMonths: number
}

/**
 * Reads the two retention windows from `settings`, answering the 24-month
 * defaults of `PLAN.md` §15 where no row exists or a row is malformed.
 */
export async function readPrivacyRetentionSettings(
  database: Db,
): Promise<PrivacyRetentionSettings> {
  const [contact, photo] = await Promise.all([
    readSetting(database, CONTACT_RETENTION_MONTHS_KEY),
    readSetting(database, PHOTO_RETENTION_MONTHS_KEY),
  ])

  return {
    contactRetentionMonths: retentionMonthsOf(contact, DEFAULT_RETENTION_MONTHS),
    photoRetentionMonths: retentionMonthsOf(photo, DEFAULT_RETENTION_MONTHS),
  }
}

/**
 * Upserts the two retention windows in one transaction and answers the
 * effective values; an omitted window keeps its current value or default.
 */
export async function storePrivacyRetentionSettings(
  database: Db,
  retention?: PrivacyRetentionSettings,
): Promise<PrivacyRetentionSettings> {
  const rows: { key: string; value: number }[] = []

  if (retention?.contactRetentionMonths !== undefined) {
    rows.push({ key: CONTACT_RETENTION_MONTHS_KEY, value: retention.contactRetentionMonths })
  }

  if (retention?.photoRetentionMonths !== undefined) {
    rows.push({ key: PHOTO_RETENTION_MONTHS_KEY, value: retention.photoRetentionMonths })
  }

  if (rows.length > 0) {
    await database.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(settings)
          .values({ key: row.key, value: row.value })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: row.value, updatedAt: new Date() },
          })
      }
    })
  }

  return await readPrivacyRetentionSettings(database)
}
