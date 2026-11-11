import { z } from 'zod'

/**
 * Freely definable manual escalation stages (`PLAN.md` §9,
 * `specs/07-escalation.md` §7.5).
 *
 * The array order is the escalation order. `names` holds one display name per
 * locale (at least `de` and `en`); more locales can be added without a schema
 * change. `deadlineMinutes` is the reaction deadline of the stage and applies to
 * all priorities.
 */

export const ESCALATION_STAGE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/

const locale = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/)
const name = z.string().trim().min(1).max(80)

export const escalationStageSchema = z.object({
  key: z.string().regex(ESCALATION_STAGE_KEY_PATTERN),
  names: z.record(locale, name),
  deadlineMinutes: z.number().int().min(1).max(10080),
})

export type EscalationStage = z.infer<typeof escalationStageSchema>

export const escalationStagesSchema = z
  .object({
    stages: z.array(escalationStageSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    const keys = new Set<string>()

    value.stages.forEach((stage, index) => {
      if (keys.has(stage.key)) {
        context.addIssue({
          code: 'custom',
          path: ['stages', index, 'key'],
          message: 'duplicate_stage_key',
        })
      }
      keys.add(stage.key)

      for (const required of ['de', 'en'] as const) {
        if ((stage.names[required] ?? '').trim() === '') {
          context.addIssue({
            code: 'custom',
            path: ['stages', index, 'names', required],
            message: 'required_locale',
          })
        }
      }
    })
  })

export type EscalationStages = z.infer<typeof escalationStagesSchema>

export const ESCALATION_STAGES_KEY = 'ticket.escalation_stages'

export const DEFAULT_ESCALATION_STAGES: readonly EscalationStage[] = [
  {
    key: 'office',
    names: { de: 'Büro', en: 'Office' },
    deadlineMinutes: 15,
  },
  {
    key: 'group',
    names: { de: 'Gruppe', en: 'Group' },
    deadlineMinutes: 30,
  },
  {
    key: 'assignee',
    names: { de: 'Bearbeiter', en: 'Assignee' },
    deadlineMinutes: 60,
  },
  {
    key: 'manager',
    names: { de: 'Leitung', en: 'Management' },
    deadlineMinutes: 120,
  },
]

/** Index of the next stage after `currentKey`; the last stage stays the last. */
export function nextEscalationStage(
  stages: readonly EscalationStage[],
  currentKey: string | null,
): EscalationStage | null {
  if (stages.length === 0) {
    return null
  }

  if (currentKey === null) {
    return stages[0] ?? null
  }

  const index = stages.findIndex((stage) => stage.key === currentKey)

  if (index === -1) {
    return stages[0] ?? null
  }

  return stages[Math.min(index + 1, stages.length - 1)] ?? null
}

/** Locale name with `en`, then `de`, then the key as fallback. */
export function escalationStageName(
  stage: Pick<EscalationStage, 'key' | 'names'>,
  locale: string,
): string {
  return stage.names[locale] ?? stage.names.en ?? stage.names.de ?? stage.key
}
