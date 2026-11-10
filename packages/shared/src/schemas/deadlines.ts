import { z } from 'zod'

import type { EscalationRuleKey } from '../escalation.js'

/**
 * Deadline and reaction settings of phase 6 (`specs/05-timeline.md` §5.1,
 * ADR-0008). The same shape is the response of `GET` and the body of `PUT`
 * `/api/v1/settings/deadlines`.
 *
 * `hours` is the deadline length per priority. `reactionMinutes` holds the four
 * minute rules: `standard` applies to low, normal and high tickets, `critical`
 * to critical tickets (the escalation model has no finer granularity).
 * `stageTexts` holds the name and the description of every escalation stage;
 * both are editable per stage, because the reason of an escalation has to be
 * readable in the ticket history.
 */

const hours = z.number().int().min(1).max(8760)
const minutes = z.number().int().min(1).max(10080)

const reactionRule = z.object({ standard: minutes, critical: minutes })

/** A localized stage name: at most 120 characters per language. */
const stageLabel = z.object({
  de: z.string().trim().min(1).max(120),
  en: z.string().trim().min(1).max(120),
})

/** A localized stage description: at most 500 characters per language. */
const stageDescription = z.object({
  de: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
})

export const escalationStageTextSchema = z.object({
  label: stageLabel,
  description: stageDescription,
})

export type EscalationStageTextSettings = z.infer<typeof escalationStageTextSchema>

/** The stage texts of every escalation rule; the shape follows the rule keys. */
const stageTextShape = {
  new_without_review: escalationStageTextSchema,
  work_order_without_distribution: escalationStageTextSchema,
  offered_without_claim: escalationStageTextSchema,
  assigned_without_accept: escalationStageTextSchema,
  deadline_80_percent: escalationStageTextSchema,
  deadline_exceeded: escalationStageTextSchema,
} satisfies Record<EscalationRuleKey, typeof escalationStageTextSchema>

export const escalationStageTextsSchema = z.object(stageTextShape)

export type EscalationStageTexts = z.infer<typeof escalationStageTextsSchema>

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
  stageTexts: escalationStageTextsSchema,
})

export type DeadlineSettings = z.infer<typeof deadlineSettingsSchema>
