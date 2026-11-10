/**
 * Escalation rules (`PLAN.md` §9, `specs/07-escalation.md` §7.1, ADR-0008).
 *
 * The module is pure: the scan of WP-M6-08 resolves the rules for one priority
 * with the optional `settings` overrides and compares them with the ticket clock.
 * Minutes are resolved once per rule; deadline rules carry a percentage instead.
 */

import type { TicketPriority } from './timeline.js'

export type EscalationLevel = 'office' | 'group' | 'assignee' | 'manager'

export type EscalationRuleKey =
  | 'new_without_review'
  | 'work_order_without_distribution'
  | 'offered_without_claim'
  | 'assigned_without_accept'
  | 'deadline_80_percent'
  | 'deadline_exceeded'

export type EscalationReference = 'received_at' | 'work_order_set' | 'offered' | 'assigned'

export type EscalationRuleDefinition = {
  key: EscalationRuleKey
  level: EscalationLevel
  /** Reference point of a minute rule; `null` for a deadline rule. */
  reference: EscalationReference | null
  minutes: number
  criticalMinutes: number
  /** Deadline rules use a percentage of the timeline instead of minutes. */
  percent: number | null
}

export const ESCALATION_RULES: readonly EscalationRuleDefinition[] = [
  {
    key: 'new_without_review',
    level: 'office',
    reference: 'received_at',
    minutes: 15,
    criticalMinutes: 5,
    percent: null,
  },
  {
    key: 'work_order_without_distribution',
    level: 'office',
    reference: 'work_order_set',
    minutes: 30,
    criticalMinutes: 30,
    percent: null,
  },
  {
    key: 'offered_without_claim',
    level: 'group',
    reference: 'offered',
    minutes: 20,
    criticalMinutes: 10,
    percent: null,
  },
  {
    key: 'assigned_without_accept',
    level: 'office',
    reference: 'assigned',
    minutes: 15,
    criticalMinutes: 15,
    percent: null,
  },
  {
    key: 'deadline_80_percent',
    level: 'assignee',
    reference: null,
    minutes: 0,
    criticalMinutes: 0,
    percent: 80,
  },
  {
    key: 'deadline_exceeded',
    level: 'manager',
    reference: null,
    minutes: 0,
    criticalMinutes: 0,
    percent: 100,
  },
]

export type EscalationRuleOverride = {
  minutes?: number
  criticalMinutes?: number
}

/** A localized text of an escalation stage: the name and the reason. */
export type EscalationStageText = {
  /** Name of the stage, shown as "Escalation: <label>" in the ticket history. */
  label: { de: string; en: string }
  /** Why the stage escalated, shown below the name. */
  description: { de: string; en: string }
}

/**
 * The default name and description of every escalation stage.
 *
 * The texts are a localized resource like the standard texts (`PLAN.md` §3),
 * never a German literal in the API. An installation replaces them per stage in
 * the deadline settings: `ticket.escalation.<rule>.label` and
 * `ticket.escalation.<rule>.description` hold the same `{ de, en }` shape.
 */
export const ESCALATION_STAGE_TEXTS: Record<EscalationRuleKey, EscalationStageText> = {
  new_without_review: {
    label: { de: 'Prüfung', en: 'Review' },
    description: { de: 'Meldung noch nicht geprüft', en: 'Report not reviewed yet' },
  },
  work_order_without_distribution: {
    label: { de: 'Arbeitsauftrag', en: 'Work order' },
    description: {
      de: 'Arbeitsauftrag noch nicht erstellt',
      en: 'Work order not created yet',
    },
  },
  offered_without_claim: {
    label: { de: 'Übernahme', en: 'Claim' },
    description: { de: 'Angebot noch nicht übernommen', en: 'Offer not claimed yet' },
  },
  assigned_without_accept: {
    label: { de: 'Annahme', en: 'Acceptance' },
    description: { de: 'Auftrag noch nicht angenommen', en: 'Work order not accepted yet' },
  },
  deadline_80_percent: {
    label: { de: 'Frist zu 80 %', en: '80 % of the deadline' },
    description: {
      de: '80 % der Bearbeitungsfrist erreicht',
      en: '80 % of the processing deadline reached',
    },
  },
  deadline_exceeded: {
    label: { de: 'Frist überschritten', en: 'Deadline exceeded' },
    description: { de: 'Bearbeitungsfrist überschritten', en: 'Processing deadline exceeded' },
  },
}

export type EscalationRule = {
  key: EscalationRuleKey
  level: EscalationLevel
  reference: EscalationReference | null
  thresholdMs: number
  percent: number | null
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Resolves the six rules for one priority. The critical override only replaces
 * the minutes for a `critical` ticket; an invalid override keeps the default.
 */
export function escalationRulesFor(
  priority: string,
  overrides: Partial<Record<EscalationRuleKey, EscalationRuleOverride>> = {},
): EscalationRule[] {
  const key = priority as TicketPriority
  const isCritical = key === 'critical'

  return ESCALATION_RULES.map((rule) => {
    const override = overrides[rule.key]
    const base = isCritical ? rule.criticalMinutes : rule.minutes
    const minuteOverride = isCritical
      ? positive(override?.criticalMinutes) ?? positive(override?.minutes)
      : positive(override?.minutes)
    const minutes = minuteOverride ?? base

    return {
      key: rule.key,
      level: rule.level,
      reference: rule.reference,
      thresholdMs: minutes * 60 * 1000,
      percent: rule.percent,
    }
  })
}
