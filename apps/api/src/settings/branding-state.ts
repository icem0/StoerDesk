import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * The branding settings row (`PLAN.md` §14, WP-M2-29).
 *
 * One jsonb row under the key `branding`: `{ companyName, titleEnabled, logo }`.
 * This module is the single reading point for the `titleEnabled` flag, which
 * decides whether a ticket carries a title at all:
 *
 * - the public report form offers a title input (WP-M2-90c),
 * - the internal creation form offers a title input (WP-M9-26),
 * - a new ticket stores its title only while the flag is on (WP-M2-89, WP-M2-95),
 * - the ticket detail and the e-mail view show a title only while the flag is on
 *   (WP-M9-25).
 *
 * A missing or malformed row means `false` — the same rule everywhere.
 */

/** The key of the branding row in the `settings` table. */
export const BRANDING_KEY = 'branding'

type Db = Database['database']

/**
 * Reads the `titleEnabled` flag out of a raw branding row value.
 *
 * Returns `false` when the value is missing, not an object or carries no
 * boolean `titleEnabled` — a malformed row never enables titles.
 */
export function parseTitleEnabled(value: unknown): boolean {
  return value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { titleEnabled?: unknown }).titleEnabled === 'boolean'
    ? (value as { titleEnabled: boolean }).titleEnabled
    : false
}

/**
 * Reads the `titleEnabled` flag of the branding row.
 *
 * Returns `false` when the row is missing, when the value is not an object or
 * when `titleEnabled` is not a boolean — a malformed row never enables titles.
 */
export async function readTitleEnabled(database: Db): Promise<boolean> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, BRANDING_KEY))
    .limit(1)

  return parseTitleEnabled(row?.value)
}
