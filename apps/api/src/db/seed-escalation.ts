import { like } from 'drizzle-orm'

import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
  type EscalationMinutes,
} from '@stoerdesk/shared'

import type { Database } from './client'
import { escalationRules, escalationStages, settings } from './schema'

/**
 * Bootstrap of the escalation configuration (`specs/07-escalation.md` §7.2,
 * ADR-0017, WP-M13-04).
 *
 * The five stages of the workflow and the rules of §7.2 are inserted the first
 * time the API starts. The deadlines of an installation that changed them in
 * the former administration are taken over: the settings rows
 * `ticket.escalation.<rule>.minutes` and `.critical_minutes` hold the standard
 * and the critical value of the old rules, the standard value applies to
 * `low`, `normal` and `high`.
 *
 * An existing row is never overwritten: the seed only fills what is missing,
 * so an administrator keeps the configuration of the installation.
 */

export type EscalationSeedResult = {
  status: 'created' | 'existing'
  stages: number
  rules: number
}

type Db = Database['database']

type LegacyMinutes = {
  standard?: number
  critical?: number
}

/**
 * The new rule keys and the rules of the former hard-coded list they replace.
 * The rules `work_order` and `acknowledgement` are new and have no predecessor.
 */
const LEGACY_RULE_BY_RULE_KEY: Record<string, string> = {
  review: 'new_without_review',
  assignment: 'work_order_without_distribution',
  acceptance_offer: 'offered_without_claim',
  acceptance_assignment: 'assigned_without_accept',
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Reads the former settings rows of the escalation minutes. */
async function readLegacyMinutes(database: Db): Promise<Record<string, LegacyMinutes>> {
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, 'ticket.escalation.%'))

  const legacy: Record<string, LegacyMinutes> = {}

  for (const row of rows) {
    const match = /^ticket\.escalation\.([a-z0-9_]+)\.(minutes|critical_minutes)$/.exec(row.key)

    if (match === null) {
      continue
    }

    const rule = match[1]
    const field = match[2]

    if (rule === undefined || field === undefined) {
      continue
    }
    const raw =
      typeof row.value === 'number'
        ? row.value
        : typeof row.value === 'object' && row.value !== null
          ? (row.value as Record<string, unknown>)[field]
          : undefined
    const value = positiveNumber(raw)

    if (value === undefined) {
      continue
    }

    legacy[rule] = { ...legacy[rule], [field === 'minutes' ? 'standard' : 'critical']: value }
  }

  return legacy
}

function minutesWithLegacy(minutes: EscalationMinutes, legacy: LegacyMinutes | undefined) {
  const standard = legacy?.standard
  const critical = legacy?.critical

  return {
    low: standard ?? minutes.low,
    normal: standard ?? minutes.normal,
    high: standard ?? minutes.high,
    critical: critical ?? minutes.critical,
  }
}

export async function seedEscalation(database: Db): Promise<EscalationSeedResult> {
  return database.transaction(async (tx) => {
    const legacy = await readLegacyMinutes(tx as unknown as Db)

    let stages = 0

    for (const stage of DEFAULT_WORKFLOW_ESCALATION_STAGES) {
      const inserted = await tx
        .insert(escalationStages)
        .values({
          key: stage.key,
          names: stage.names,
          position: stage.position,
          active: stage.active,
        })
        .onConflictDoNothing({ target: escalationStages.key })
        .returning({ key: escalationStages.key })

      stages += inserted.length
    }

    let rules = 0

    for (const [position, rule] of DEFAULT_WORKFLOW_ESCALATION_RULES.entries()) {
      const legacyKey = LEGACY_RULE_BY_RULE_KEY[rule.key]
      const minutes =
        rule.minutes === null
          ? null
          : minutesWithLegacy(rule.minutes, legacyKey === undefined ? undefined : legacy[legacyKey])

      const inserted = await tx
        .insert(escalationRules)
        .values({
          key: rule.key,
          stageKey: rule.stageKey,
          reference: rule.reference,
          minutes,
          percent: rule.percent,
          condition: rule.condition,
          position,
          active: rule.active,
        })
        .onConflictDoNothing({ target: escalationRules.key })
        .returning({ key: escalationRules.key })

      rules += inserted.length
    }

    return {
      status: stages + rules === 0 ? 'existing' : 'created',
      stages,
      rules,
    }
  })
}
