import { z } from 'zod'

/**
 * Deadline settings of phase 6 (`specs/05-timeline.md` §5.1, ADR-0008).
 *
 * The same shape is the response of `GET` and the body of `PUT`
 * `/api/v1/settings/deadlines`. `hours` is the deadline length per priority.
 * The reaction minutes of the former hard-coded rules are gone: the deadline
 * of a stage belongs to its rule in the escalation configuration
 * (`specs/07-escalation.md` §7.2, ADR-0017, WP-M13-13).
 */

const hours = z.number().int().min(1).max(8760)

/** Effective deadline hours per priority, defaults applied. */
export const deadlineHoursSchema = z.object({
  low: hours,
  normal: hours,
  high: hours,
  critical: hours,
})

export type DeadlineHours = z.infer<typeof deadlineHoursSchema>

export const deadlineSettingsSchema = z.object({
  hours: deadlineHoursSchema,
})

export type DeadlineSettings = z.infer<typeof deadlineSettingsSchema>
