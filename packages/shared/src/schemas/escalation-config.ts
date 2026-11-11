import { z } from 'zod'

import { TICKET_PRIORITIES } from '../timeline.js'
import { TICKET_STATUS_VALUES } from './ticket.js'

/**
 * Contracts of the escalation configuration (`specs/07-escalation.md`
 * §7.1–§7.5, ADR-0017).
 *
 * The escalation stages are the milestones of the ticket workflow: their keys
 * are fixed, their names and their deadlines are maintained in the
 * administration. A rule is a waiting deadline with a condition and a list of
 * actions; a condition is a typed tree over a closed list of fields, never an
 * expression. The evaluation is a pure function, so the API and the
 * administration form share it.
 *
 * The names carry the suffix `Config`, because the contracts of the former
 * manual stage catalogue (`EscalationStage`, `EscalationRule`) still exist
 * until WP-M13-11 removes them.
 */

/** The five stage keys of §7.1; a stage is a milestone of the workflow. */
export const ESCALATION_STAGE_KEYS = [
  'review',
  'work_order',
  'assignment',
  'acceptance',
  'acknowledgement',
] as const

export type EscalationStageKey = (typeof ESCALATION_STAGE_KEYS)[number]

/** The events that start the waiting clock of a rule (§7.2). */
export const ESCALATION_REFERENCE_EVENTS = [
  'received_at',
  'review_started',
  'work_order_set',
  'offered',
  'assigned',
  'accepted',
] as const

export type EscalationReferenceEvent = (typeof ESCALATION_REFERENCE_EVENTS)[number]

/** The actions of a rule (§7.5); none of them changes a ticket. */
export const ESCALATION_ACTION_TYPES = ['notify', 'webhook', 'history'] as const

export type EscalationActionType = (typeof ESCALATION_ACTION_TYPES)[number]

/** The sources of a ticket (`PLAN.md` §6). */
export const ESCALATION_SOURCES = ['QR', 'INTERNAL', 'API'] as const

/** The system types of an object (`PLAN.md` §6). */
export const ESCALATION_SYSTEM_TYPES = [
  'BMA',
  'LICHTRUF',
  'RWA',
  'EMA',
  'SPRACHALARM',
  'SONSTIGE',
] as const

const keyPattern = /^[a-z][a-z0-9_]{0,39}$/
const localePattern = /^[a-z]{2}(-[A-Z]{2})?$/
const minutes = z.number().int().min(1).max(10080)

/** The deadline of a stage per priority (§7.2). */
export const escalationMinutesSchema = z.object({
  low: minutes,
  normal: minutes,
  high: minutes,
  critical: minutes,
})

export type EscalationMinutes = z.infer<typeof escalationMinutesSchema>

export const escalationStageConfigSchema = z.object({
  key: z.enum(ESCALATION_STAGE_KEYS),
  /** One display name per locale; `de` and `en` are required. */
  names: z.record(z.string().regex(localePattern), z.string().trim().min(1).max(80)),
  position: z.number().int().min(1).max(20),
  active: z.boolean(),
})

export type EscalationStageConfig = z.infer<typeof escalationStageConfigSchema>

const enumOperators = ['eq', 'ne', 'in', 'notIn'] as const
const numberOperators = ['gt', 'gte', 'lt', 'lte', 'eq'] as const
const stringOperators = ['eq', 'ne', 'contains'] as const
const booleanOperators = ['eq'] as const

const listOperator = (operator: string): boolean => operator === 'in' || operator === 'notIn'

function leaf<F extends string, V extends z.ZodTypeAny>(
  field: F,
  operators: readonly string[],
  value: V,
) {
  return z.object({
    field: z.literal(field),
    operator: z.enum(operators as [string, ...string[]]),
    value,
  })
}

/** One leaf of a condition: a field, an operator and a value (§7.4). */
export const escalationConditionLeafSchema = z.union([
  leaf(
    'priority',
    enumOperators,
    z.union([z.enum(TICKET_PRIORITIES), z.array(z.enum(TICKET_PRIORITIES)).min(1)]),
  ),
  leaf(
    'status',
    enumOperators,
    z.union([z.enum(TICKET_STATUS_VALUES), z.array(z.enum(TICKET_STATUS_VALUES)).min(1)]),
  ),
  leaf(
    'source',
    enumOperators,
    z.union([z.enum(ESCALATION_SOURCES), z.array(z.enum(ESCALATION_SOURCES)).min(1)]),
  ),
  leaf(
    'systemType',
    enumOperators,
    z.union([z.enum(ESCALATION_SYSTEM_TYPES), z.array(z.enum(ESCALATION_SYSTEM_TYPES)).min(1)]),
  ),
  leaf(
    'objectExternalType',
    stringOperators,
    z.union([
      z.string().trim().min(1).max(120),
      z.array(z.string().trim().min(1).max(120)).min(1),
    ]),
  ),
  leaf('assigned', booleanOperators, z.boolean()),
  leaf('paused', booleanOperators, z.boolean()),
  leaf('deadlinePercent', numberOperators, z.number().min(0).max(100)),
  leaf('elapsedMinutes', numberOperators, z.number().min(0).max(1000000)),
  leaf(
    'stageReached',
    enumOperators,
    z.union([z.enum(ESCALATION_STAGE_KEYS), z.array(z.enum(ESCALATION_STAGE_KEYS)).min(1)]),
  ),
])

export type EscalationConditionLeaf = z.infer<typeof escalationConditionLeafSchema>

/**
 * A condition is a tree of `all`/`any` groups over the leaves. The depth is
 * limited to two levels and a group holds at most 20 leaves (§7.4).
 */
export type EscalationCondition =
  | { all: readonly EscalationCondition[] }
  | { any: readonly EscalationCondition[] }
  | EscalationConditionLeaf

const conditionSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).max(20) }),
    z.object({ any: z.array(conditionSchema).max(20) }),
    escalationConditionLeafSchema,
  ]),
)

export const escalationConditionSchema = conditionSchema as unknown as z.ZodType<EscalationCondition>

/**
 * The number of group levels of a condition tree; the limit of §7.4 is two.
 * A leaf has no group level.
 */
export function escalationConditionDepth(condition: EscalationCondition): number {
  if ('all' in condition) {
    return 1 + Math.max(0, ...condition.all.map(escalationConditionDepth))
  }

  if ('any' in condition) {
    return 1 + Math.max(0, ...condition.any.map(escalationConditionDepth))
  }

  return 0
}

/** The number of leaves of a condition tree; the limit of §7.4 is 20. */
export function escalationConditionLeafCount(condition: EscalationCondition): number {
  if ('all' in condition) {
    return condition.all.reduce((sum, child) => sum + escalationConditionLeafCount(child), 0)
  }

  if ('any' in condition) {
    return condition.any.reduce((sum, child) => sum + escalationConditionLeafCount(child), 0)
  }

  return 1
}

/** The leaves of a condition tree, in order. */
export function escalationConditionLeaves(condition: EscalationCondition): EscalationConditionLeaf[] {
  if ('all' in condition) {
    return condition.all.flatMap(escalationConditionLeaves)
  }

  if ('any' in condition) {
    return condition.any.flatMap(escalationConditionLeaves)
  }

  return [condition]
}

export const escalationActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    key: z.string().regex(keyPattern),
    type: z.literal('notify'),
    /** The channels of the installation that receive the notification. */
    channels: z.array(z.string().min(1).max(40)).min(1).max(10),
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(keyPattern),
    type: z.literal('webhook'),
    /** The webhook endpoints of the administration that receive the event. */
    endpointIds: z.array(z.uuid()).min(1).max(20),
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(keyPattern),
    type: z.literal('history'),
    /** The note of the ticket history; the event carries it unchanged. */
    text: z.string().trim().min(1).max(500).optional(),
    condition: escalationConditionSchema,
  }),
])

export type EscalationActionConfig = z.infer<typeof escalationActionConfigSchema>

export const escalationRuleConfigSchema = z
  .object({
    key: z.string().regex(keyPattern),
    /** The stage of the rule; the deadline rules carry no stage. */
    stageKey: z.enum(ESCALATION_STAGE_KEYS).nullable(),
    /** The event that starts the waiting clock. */
    reference: z.enum(ESCALATION_REFERENCE_EVENTS).nullable(),
    /** The waiting deadline per priority. */
    minutes: escalationMinutesSchema.nullable(),
    /** The percentage of the timeline of a deadline rule. */
    percent: z.number().int().min(1).max(100).nullable(),
    condition: escalationConditionSchema,
    actions: z.array(escalationActionConfigSchema).max(20),
    active: z.boolean(),
  })
  .superRefine((rule, context) => {
    const hasClock = rule.reference !== null && rule.minutes !== null
    const hasPercent = rule.percent !== null

    if (hasClock === hasPercent) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'a rule has either a clock or a percentage',
      })
    }

    if (hasClock && rule.stageKey === null) {
      context.addIssue({
        code: 'custom',
        path: ['stageKey'],
        message: 'a rule with a clock belongs to a stage',
      })
    }
  })

export type EscalationRuleConfig = z.infer<typeof escalationRuleConfigSchema>

export const escalationConfigSchema = z
  .object({
    stages: z.array(escalationStageConfigSchema).max(ESCALATION_STAGE_KEYS.length),
    rules: z.array(escalationRuleConfigSchema).max(50),
  })
  .superRefine((config, context) => {
    const stageKeys = new Set<string>()

    config.stages.forEach((stage, index) => {
      if (stageKeys.has(stage.key)) {
        context.addIssue({
          code: 'custom',
          path: ['stages', index, 'key'],
          message: 'duplicate_stage_key',
        })
      }

      stageKeys.add(stage.key)

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

    const ruleKeys = new Set<string>()

    config.rules.forEach((rule, index) => {
      if (ruleKeys.has(rule.key)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'key'],
          message: 'duplicate_rule_key',
        })
      }

      ruleKeys.add(rule.key)

      if (rule.stageKey !== null && !stageKeys.has(rule.stageKey)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'stageKey'],
          message: 'unknown_stage_key',
        })
      }
    })

    const checkCondition = (condition: EscalationCondition, path: (string | number)[]) => {
      if (escalationConditionDepth(condition) > 2) {
        context.addIssue({ code: 'custom', path, message: 'condition_too_deep' })
      }

      if (escalationConditionLeafCount(condition) > 20) {
        context.addIssue({ code: 'custom', path, message: 'condition_too_many_leaves' })
      }

      for (const conditionLeaf of escalationConditionLeaves(condition)) {
        const isList = Array.isArray(conditionLeaf.value)

        if (listOperator(conditionLeaf.operator) !== isList) {
          context.addIssue({
            code: 'custom',
            path,
            message: 'operator_value_mismatch',
          })
        }
      }
    }

    config.rules.forEach((rule, index) => {
      checkCondition(rule.condition, ['rules', index, 'condition'])

      rule.actions.forEach((action, actionIndex) => {
        checkCondition(action.condition, ['rules', index, 'actions', actionIndex, 'condition'])
      })
    })
  })

export type EscalationConfig = z.infer<typeof escalationConfigSchema>

/**
 * The facts of a ticket that a condition is evaluated against. They are
 * collected by the API; the evaluation itself is pure.
 */
export type EscalationFacts = {
  priority: string
  status: string
  source: string
  systemType: string | null
  objectExternalType: string | null
  assigned: boolean
  deadlinePercent: number
  elapsedMinutes: number
  paused: boolean
  stageReached: readonly string[]
}

const listValue = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry)) : [String(value)]

function evaluateLeaf(leaf: EscalationConditionLeaf, facts: EscalationFacts): boolean {
  switch (leaf.field) {
    case 'priority':
    case 'status':
    case 'source':
    case 'systemType': {
      const actual = facts[leaf.field] ?? ''

      if (leaf.operator === 'in') {
        return listValue(leaf.value).includes(actual)
      }

      if (leaf.operator === 'notIn') {
        return !listValue(leaf.value).includes(actual)
      }

      const equals = actual === leaf.value

      return leaf.operator === 'ne' ? !equals : equals
    }

    case 'objectExternalType': {
      const actual = (facts.objectExternalType ?? '').toLowerCase()

      if (leaf.operator === 'contains') {
        return actual.includes(String(leaf.value).toLowerCase())
      }

      const equals = actual === String(leaf.value).toLowerCase()

      return leaf.operator === 'ne' ? !equals : equals
    }

    case 'assigned':
    case 'paused': {
      const actual = facts[leaf.field]

      return leaf.operator === 'eq' ? actual === leaf.value : actual !== leaf.value
    }

    case 'deadlinePercent':
    case 'elapsedMinutes': {
      const actual = facts[leaf.field]

      switch (leaf.operator) {
        case 'gt':
          return actual > leaf.value
        case 'gte':
          return actual >= leaf.value
        case 'lt':
          return actual < leaf.value
        case 'lte':
          return actual <= leaf.value
        default:
          return actual === leaf.value
      }
    }

    case 'stageReached': {
      const reached = facts.stageReached

      if (leaf.operator === 'in') {
        return listValue(leaf.value).some((stage) => reached.includes(stage))
      }

      if (leaf.operator === 'notIn') {
        return !listValue(leaf.value).some((stage) => reached.includes(stage))
      }

      const contains = reached.includes(String(leaf.value))

      return leaf.operator === 'ne' ? !contains : contains
    }

    default:
      return false
  }
}

/**
 * Evaluates a condition against the facts of a ticket. An empty condition
 * matches — the rule then depends only on its trigger.
 */
export function evaluateEscalationCondition(
  condition: EscalationCondition | null | undefined,
  facts: EscalationFacts,
): boolean {
  if (condition === null || condition === undefined) {
    return true
  }

  if ('all' in condition) {
    return condition.all.every((child) => evaluateEscalationCondition(child, facts))
  }

  if ('any' in condition) {
    return condition.any.some((child) => evaluateEscalationCondition(child, facts))
  }

  return evaluateLeaf(condition, facts)
}

/** The stages of an installation with their default names (§7.1). */
export const DEFAULT_WORKFLOW_ESCALATION_STAGES: readonly EscalationStageConfig[] = [
  { key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true },
  {
    key: 'work_order',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    position: 2,
    active: true,
  },
  {
    key: 'assignment',
    names: { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' },
    position: 3,
    active: true,
  },
  { key: 'acceptance', names: { de: 'Angenommen', en: 'Accepted' }, position: 4, active: true },
  {
    key: 'acknowledgement',
    names: { de: 'Quittiert', en: 'Acknowledged' },
    position: 5,
    active: true,
  },
]

const evenMinutes = (value: number) => ({
  low: value,
  normal: value,
  high: value,
  critical: value,
})

/**
 * The rules of a fresh installation (§7.2). The deadlines of ADR-0008 are the
 * seed; the installation changes them in the administration.
 */
export const DEFAULT_WORKFLOW_ESCALATION_RULES: readonly EscalationRuleConfig[] = [
  {
    key: 'review',
    stageKey: 'review',
    reference: 'received_at',
    minutes: { low: 15, normal: 15, high: 15, critical: 5 },
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'work_order',
    stageKey: 'work_order',
    reference: 'review_started',
    minutes: evenMinutes(30),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'assignment',
    stageKey: 'assignment',
    reference: 'work_order_set',
    minutes: evenMinutes(30),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acceptance_offer',
    stageKey: 'acceptance',
    reference: 'offered',
    minutes: { low: 20, normal: 20, high: 20, critical: 10 },
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acceptance_assignment',
    stageKey: 'acceptance',
    reference: 'assigned',
    minutes: evenMinutes(15),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acknowledgement',
    stageKey: 'acknowledgement',
    reference: 'accepted',
    minutes: evenMinutes(60),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'deadline_80_percent',
    stageKey: null,
    reference: null,
    minutes: null,
    percent: 80,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'deadline_exceeded',
    stageKey: null,
    reference: null,
    minutes: null,
    percent: 100,
    condition: { all: [] },
    actions: [],
    active: true,
  },
]
