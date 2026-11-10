import { z } from 'zod'

/**
 * Deadline and reaction settings of phase 6 (`specs/05-timeline.md` §5.1,
 * ADR-0008). The same shape is the response of `GET` and the body of `PUT`
 * `/api/v1/settings/deadlines`.
 *
 * `hours` is the deadline length per priority. `reactionMinutes` holds the four
 * minute rules: `standard` applies to low, normal and high tickets, `critical`
 * to critical tickets (the escalation model has no finer granularity).
 */

const hours = z.number().int().min(1).max(8760)
const minutes = z.number().int().min(1).max(10080)

const reactionRule = z.object({ standard: minutes, critical: minutes })

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
  reactionMinutes: z.object({
    new_without_review: reactionRule,
    work_order_without_distribution: reactionRule,
    offered_without_claim: reactionRule,
    assigned_without_accept: reactionRule,
  }),
})

export type DeadlineSettings = z.infer<typeof deadlineSettingsSchema>
