/**
 * Escapes a value for use inside a SQL `LIKE` pattern.
 *
 * Backslash, percent and underscore are escaped so a search string is matched
 * literally; anything else passes through unchanged. A trailing backslash no
 * longer swallows the closing wildcard — matches fail-closed instead of
 * matching extra rows.
 *
 * `PLAN.md` §15 (audit, SEC-012): shared by the ticket list search and the
 * object list search.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1')
}
