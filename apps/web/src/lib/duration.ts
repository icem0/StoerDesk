/**
 * Duration display of the statistics (`specs/12-stats.md` §12.2).
 *
 * The API keeps its values in minutes. From 60 minutes on the web converts the
 * figure to hours with at most one decimal, so a wall display or the statistics
 * page never shows "360 min" where "6 h" is meant. Below 60 minutes the minute
 * value stays exact.
 */

export function isHourValue(minutes: number): boolean {
  return minutes >= 60
}

export function formatHours(minutes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(minutes / 60)
}
