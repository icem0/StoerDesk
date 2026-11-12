/**
 * Escalation helpers (`specs/07-escalation.md` §7.2, ADR-0017, WP-M13-11).
 *
 * The rules are configuration in the database (`escalation_rules`, WP-M13-03);
 * the former hard-coded rule list and its resolver are gone. This module keeps
 * only the pure helper a scan needs to read an optional minute override.
 */

/** A usable minute value: finite and positive, everything else is `undefined`. */
export function positiveMinutes(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}
