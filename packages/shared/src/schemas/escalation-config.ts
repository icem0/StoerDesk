import { z } from 'zod'

import { TICKET_PRIORITIES } from '../timeline.js'
import {
  TIME_OF_DAY_INTERVAL_PATTERN,
  minutesOfDay,
  timeOfDayIntervalMatches,
  wallClockMinutes,
} from '../escalation.js'
import { TICKET_STATUS_VALUES, ticketStatusKeySchema } from './ticket.js'
import { escalationTargetSchema } from './target.js'

/**
 * Contracts of the escalation configuration (`specs/07-escalation.md`
 * §7.1–§7.5, ADR-0017).
 *
 * The escalation stages are the milestones of the ticket workflow: their keys
 * are free, their names, their predecessor and their reaching events are
 * maintained in the administration. A rule is a waiting deadline with a
 * condition and a list of actions; a condition is a typed tree over a closed
 * list of fields, never an expression. The evaluation is a pure function, so
 * the API and the administration form share it.
 *
 * The names carry the suffix `Config`, because the contracts of the former
 * manual stage catalogue (`EscalationStage`, `EscalationRule`) still exist
 * until WP-M13-11 removes them.
 */

/**
 * The keys of the default chain of §7.1; they are the seed only, never a
 * validation. An installation adds and removes stages of its own (ADR-0023).
 */
export const ESCALATION_STAGE_KEYS = [
  'new',
  'review',
  'work_order',
  'assignment',
  'acceptance',
  'acknowledgement',
] as const

export type EscalationStageKey = string

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

/**
 * The actions of a rule (§7.5); only a `status_change` action moves the status
 * and sets it directly (§7.13, ADR-0027).
 * The `offer` and the `assign` action distribute a ticket — they carry the
 * target of the distribution (ADR-0026, §7.14).
 */
export const ESCALATION_ACTION_TYPES = [
  'notify',
  'webhook',
  'history',
  'status_change',
  'offer',
  'assign',
  /**
   * The report of the reporter (`specs/19-customer-portal.md` §19.8, ADR-0056):
   * the action writes the ticket to the address of the reporter — but only to a
   * ticket that carries his opt-in.
   */
  'notify_reporter',
] as const

export type EscalationActionType = (typeof ESCALATION_ACTION_TYPES)[number]

/**
 * The target of an `offer` or an `assign` action (§7.14, ADR-0026, ADR-0033):
 * a readiness pool of the on-call calendar (`pool`), a user group of the
 * administration (`group`) or one technician of the installation (`user`). The
 * jsonb of the action carries no foreign key, so the configuration service
 * checks the id against those rows.
 *
 * The schema lives in `schemas/target.ts` — the contract of the ticket names
 * the target as well (`schemas/ticket.ts`).
 */
export { escalationTargetSchema } from './target.js'
export type { EscalationTarget } from './target.js'

/**
 * The target of a `notify` action: one user, a readiness pool whose
 * technicians receive the notification on their own ntfy topic, the technician
 * of the ticket (`assigned`) or the user who made the assignment (`assigner`).
 * The target replaces the channel broadcast of the action. The targets
 * `assigned` and `assigner` carry no id: the dispatcher reads them from the
 * ticket when the rule fires (§7.14, ADR-0039).
 */
export const escalationNotifyTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: z.uuid() }),
  z.object({ kind: z.literal('pool'), id: z.uuid() }),
  z.object({ kind: z.literal('assigned') }),
  z.object({ kind: z.literal('assigner') }),
])

export type EscalationNotifyTarget = z.infer<typeof escalationNotifyTargetSchema>

/** The ntfy priority levels selectable for a `notify` action. */
export const ESCALATION_NOTIFY_PRIORITIES = ['min', 'low', 'default', 'high', 'urgent'] as const

export type EscalationNotifyPriority = (typeof ESCALATION_NOTIFY_PRIORITIES)[number]

/** The numeric ntfy priority of a level (https://docs.ntfy.sh/publish/#message-priority). */
export const NTFY_PRIORITY_NUMBERS: Record<EscalationNotifyPriority, number> = {
  min: 1,
  low: 2,
  default: 3,
  high: 4,
  urgent: 5,
}

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

/**
 * The key of a rule (§7.5): the key of its stage and its number — `review#1`.
 * A rule without a stage belongs to the root `deadline` — `deadline#1`. The
 * pattern also accepts the former free key of a rule, so an installation that
 * was written before the numbering keeps a readable configuration.
 */
export const escalationRuleKeyPattern = /^[a-z][a-z0-9_]{0,39}(#[1-9][0-9]{0,2})?$/

/**
 * The key of an action (§7.5): the key of its rule and its number —
 * `review#1#1`. The pattern also accepts the former free key of an action.
 */
export const escalationActionKeyPattern = /^[a-z][a-z0-9_]{0,39}(#[1-9][0-9]{0,2}){0,2}$/

/** The root of the rules without a stage: the deadline rules (§7.2). */
export const ESCALATION_DEADLINE_ROOT = 'deadline'

/**
 * The key of the rule with the number `number` of a stage (§7.5): the key of
 * the stage and the number, `review#1`. A rule without a stage belongs to the
 * root `deadline`, `deadline#1`.
 */
export function escalationRuleKey(stageKey: string | null, number: number): string {
  return `${stageKey ?? ESCALATION_DEADLINE_ROOT}#${number}`
}

/** The key of the action with the number `number` of a rule (§7.5). */
export function escalationActionKey(ruleKey: string, number: number): string {
  return `${ruleKey}#${number}`
}

/** The deadline of a stage per priority (§7.2). */
export const escalationMinutesSchema = z.object({
  low: minutes,
  normal: minutes,
  high: minutes,
  critical: minutes,
})

export type EscalationMinutes = z.infer<typeof escalationMinutesSchema>

export const escalationStageConfigSchema = z.object({
  key: z.string().regex(keyPattern),
  /** One display name per locale; `de` and `en` are required. */
  names: z.record(z.string().regex(localePattern), z.string().trim().min(1).max(80)),
  position: z.number().int().min(1).max(20),
  active: z.boolean(),
  /** The stage whose completion starts this stage's clock; `null` is the report. */
  predecessor: z.string().regex(keyPattern).nullable().default(null),
  /** The workflow event keys that reach this stage; empty means never reached. */
  reachedBy: z.array(z.string().regex(keyPattern)).max(6).default([]),
})

export type EscalationStageConfig = z.infer<typeof escalationStageConfigSchema>

/**
 * The body of `PUT /api/v1/escalation/stages`: the whole stage set, replaced
 * in one transaction (§7.11).
 */
export const escalationStagesBodySchema = z.object({
  stages: z.array(escalationStageConfigSchema).max(20),
})

/**
 * The key of the first stage of a chain (§7.11): the stage without a
 * predecessor with the smallest position. A chain has exactly one such stage —
 * it opens the chain, its rules fire with the ticket and it cannot be deleted.
 */
export function escalationFirstStageKey(
  stages: readonly { key: string; position: number; predecessor: string | null }[],
): string | null {
  const roots = stages.filter((stage) => stage.predecessor === null)

  if (roots.length === 0) {
    return null
  }

  const first = roots.reduce((best, stage) =>
    stage.position < best.position || (stage.position === best.position && stage.key < best.key)
      ? stage
      : best,
  )

  return first.key
}

/**
 * The events that start the clock of a stage (§7.11): the events that reach
 * its predecessor. A predecessor that the workflow never reaches — an empty
 * `reachedBy` — hands its own clock down, so the clock of a chain starts at
 * the report. The stage without a predecessor waits from the report.
 */
export function escalationStageClockEvents(
  stageKey: string,
  stages: readonly { key: string; predecessor: string | null; reachedBy: readonly string[] }[],
): string[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]))
  const seen = new Set<string>()
  let current = byKey.get(stageKey)

  while (current !== undefined && current.predecessor !== null && !seen.has(current.key)) {
    seen.add(current.key)

    const predecessor = byKey.get(current.predecessor)

    if (predecessor === undefined) {
      return ['received_at']
    }

    if (predecessor.reachedBy.length > 0) {
      return [...predecessor.reachedBy]
    }

    current = predecessor
  }

  return ['received_at']
}

/**
 * Checks the chain of §7.11 and returns the field paths of every violation:
 * duplicate keys, a missing or self-referencing predecessor, a second stage
 * without a predecessor, a cycle, a position that is not greater than the
 * predecessor's and an unknown `reachedBy` event. `eventKeys` are the event
 * keys of the workflow (`tickets/workflow.ts`).
 */
export function validateEscalationStageChain(
  stages: readonly EscalationStageConfig[],
  eventKeys: readonly string[],
): string[] {
  const issues: string[] = []
  const allowedEvents = new Set(eventKeys)
  const byKey = new Map<string, EscalationStageConfig>()

  stages.forEach((stage, index) => {
    if (byKey.has(stage.key)) {
      issues.push(`stages.${index}.key`)
    } else {
      byKey.set(stage.key, stage)
    }
  })

  const firstStageKey = escalationFirstStageKey(stages)

  stages.forEach((stage, index) => {
    if (stage.predecessor !== null) {
      const predecessor = byKey.get(stage.predecessor)

      if (predecessor === undefined || stage.predecessor === stage.key) {
        issues.push(`stages.${index}.predecessor`)
      } else if (stage.position <= predecessor.position) {
        issues.push(`stages.${index}.position`)
      }
    } else if (stage.key !== firstStageKey) {
      // A chain has one stage without a predecessor — the first stage (§7.11).
      issues.push(`stages.${index}.predecessor`)
    }

    stage.reachedBy.forEach((event, eventIndex) => {
      if (!allowedEvents.has(event)) {
        issues.push(`stages.${index}.reachedBy.${eventIndex}`)
      }
    })

    const seen = new Set<string>()
    let current: string | null = stage.key

    while (current !== null) {
      if (seen.has(current)) {
        issues.push(`stages.${index}.predecessor`)
        break
      }

      seen.add(current)
      current = byKey.get(current)?.predecessor ?? null
    }
  })

  return [...new Set(issues)]
}

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
    z.union([z.string().trim().min(1).max(120), z.array(z.string().trim().min(1).max(120)).min(1)]),
  ),
  leaf('assigned', booleanOperators, z.boolean()),
  leaf('paused', booleanOperators, z.boolean()),
  leaf('deadlinePercent', numberOperators, z.number().min(0).max(100)),
  leaf('elapsedMinutes', numberOperators, z.number().min(0).max(1000000)),
  leaf(
    'stageReached',
    enumOperators,
    z.union([z.string().regex(keyPattern), z.array(z.string().regex(keyPattern)).min(1)]),
  ),
  leaf(
    'time_of_day',
    ['in', 'notIn'],
    z.union([
      z.string().regex(TIME_OF_DAY_INTERVAL_PATTERN),
      z.array(z.string().regex(TIME_OF_DAY_INTERVAL_PATTERN)).min(1),
    ]),
  ),
  /**
   * The readiness shift of a pool (§7.4, ADR-0030): the value is the uuid of
   * a readiness pool, the leaf matches when the pool has a staffed shift.
   */
  leaf('shift', ['eq', 'ne'], z.uuid()),
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

export const escalationConditionSchema =
  conditionSchema as unknown as z.ZodType<EscalationCondition>

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
export function escalationConditionLeaves(
  condition: EscalationCondition,
): EscalationConditionLeaf[] {
  if ('all' in condition) {
    return condition.all.flatMap(escalationConditionLeaves)
  }

  if ('any' in condition) {
    return condition.any.flatMap(escalationConditionLeaves)
  }

  return [condition]
}

const escalationActionUnion = z.discriminatedUnion('type', [
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('notify'),
    /**
     * The channels of the installation that receive the notification; ignored
     * when `target` is set, because the target replaces the broadcast.
     */
    channels: z.array(z.string().min(1).max(40)).min(1).max(10).optional(),
    /** The user or readiness pool that receives the notification. */
    target: escalationNotifyTargetSchema.optional(),
    /** The ntfy priority of the notification. */
    priority: z.enum(ESCALATION_NOTIFY_PRIORITIES).optional(),
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('webhook'),
    /** The webhook endpoints of the administration that receive the event. */
    endpointIds: z.array(z.uuid()).min(1).max(20),
    condition: escalationConditionSchema,
  }),
  z.object({
    /** The key is assigned by the server when the client omits it (§7.5). */
    key: z.string().regex(escalationActionKeyPattern).optional(),
    type: z.literal('history'),
    /** The text of the ticket comment; the dispatcher writes it unchanged. */
    text: z.string().trim().min(1).max(500).optional(),
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('status_change'),
    /**
     * The target status of the action (§7.5, ADR-0027) — the key of a row of
     * `ticket_statuses`; the dispatcher sets it directly.
     * The key format is the one of `ticketStatusKeySchema`.
     */
    toStatus: ticketStatusKeySchema,
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('offer'),
    /**
     * The pool of technicians the ticket is offered to (§7.14, ADR-0026) — a
     * readiness pool or a user group. The offer sets the `OFFERED` status.
     */
    target: escalationTargetSchema,
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('notify_reporter'),
    /**
     * The action writes the ticket to the address of the reporter (§19.8). The
     * opt-in of the reporter decides whether it goes out — the action without
     * the opt-in of the ticket is skipped.
     */
    condition: escalationConditionSchema,
  }),
  z.object({
    key: z.string().regex(escalationActionKeyPattern),
    type: z.literal('assign'),
    /**
     * The target of the assignment (§7.14, ADR-0057): a readiness pool, a
     * user group or one technician. The first member of the target gets the
     * ticket; a refusal passes it to the next member.
     */
    target: escalationTargetSchema.optional(),
    /**
     * The mode of the assignment — the former shape (ADR-0039, decision 3),
     * superseded by ADR-0057. The contract keeps it readable until the
     * interface has moved (WP-M32-03).
     */
    mode: z.enum(['pool', 'user']).optional(),
    /** The technician of the former mode `user`. */
    user: z.uuid().optional(),
    /**
     * `true` — the technician has to answer the assignment (`offered`);
     * `false` — the assignment is accepted at once.
     */
    acceptance: z.boolean().default(true),
    condition: escalationConditionSchema,
  }),
])

/**
 * A `notify` action needs a recipient: either a target or at least one channel.
 * The union carries the common shape; this rule keeps the old channel-only
 * actions valid while a new action may name a user or a readiness pool instead.
 */
export const escalationActionConfigSchema = escalationActionUnion.superRefine((action, context) => {
  if (
    action.type === 'notify' &&
    action.target === undefined &&
    (action.channels?.length ?? 0) === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['channels'],
      message: 'notify_needs_target_or_channel',
    })
  }

  if (action.type === 'assign') {
    if (action.target !== undefined) {
      // The target names the technician or the list of the assignment
      // (§7.14, ADR-0057); the former mode does not belong to it.
      if (action.user !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['user'],
          message: 'assign_has_no_user',
        })
      }

      return
    }

    // The former shape (ADR-0039, decision 3): the mode `user` names the
    // technician, the mode `pool` takes him from the pool of the office.
    if (action.mode === 'user' && action.user === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['user'],
        message: 'assign_needs_user',
      })
    }

    if (action.mode === 'pool' && action.user !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['user'],
        message: 'assign_pool_has_no_user',
      })
    }
  }
})

export type EscalationActionConfig = z.infer<typeof escalationActionConfigSchema>

export const escalationRuleConfigSchema = z
  .object({
    key: z.string().regex(escalationRuleKeyPattern),
    /** The stage of the rule; the deadline rules carry no stage. */
    stageKey: z.string().regex(keyPattern).nullable(),
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
    const hasMinutes = rule.minutes !== null
    const hasPercent = rule.percent !== null

    if (hasMinutes === hasPercent) {
      context.addIssue({
        code: 'custom',
        path: ['minutes'],
        message: 'a rule has either minutes or a percentage',
      })
    }

    if (hasMinutes && rule.stageKey === null) {
      context.addIssue({
        code: 'custom',
        path: ['stageKey'],
        message: 'a rule with minutes belongs to a stage',
      })
    }

    if (hasPercent && rule.reference !== null) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'a deadline rule has no reference',
      })
    }
  })

export type EscalationRuleConfig = z.infer<typeof escalationRuleConfigSchema>

/**
 * One member of the assignee pool (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-03): the id of the user and the display name. The pool is the ordered
 * list the office assigns a ticket to — no contact value.
 */
export const escalationAssigneePoolMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
})

export type EscalationAssigneePoolMember = z.infer<typeof escalationAssigneePoolMemberSchema>

export const escalationConfigSchema = z
  .object({
    stages: z.array(escalationStageConfigSchema).max(20),
    rules: z.array(escalationRuleConfigSchema).max(50),
    /** The assignee pool of the installation (§7.14, ADR-0039). */
    assigneePool: z.array(escalationAssigneePoolMemberSchema).max(50).default([]),
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

      if (rule.stageKey !== null && rule.reference !== null) {
        const clockEvents = escalationStageClockEvents(rule.stageKey, config.stages)

        if (!clockEvents.includes(rule.reference)) {
          context.addIssue({
            code: 'custom',
            path: ['rules', index, 'reference'],
            message: 'reference_does_not_match_stage_clock',
          })
        }
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
  /**
   * The wall clock `HH:MM` a `time_of_day` leaf is matched against (§7.4, WP-M14-41);
   * when it is absent, the current `Europe/Berlin` time is used.
   */
  timeOfDay?: string | null
  /**
   * The readiness pools that are staffed at the moment of the evaluation
   * (§7.4, ADR-0030): the ids of the pools with a shift that covers now. A
   * `shift` leaf matches a pool of this list. Without the fact the leaf never
   * matches — a rule that asks for a shift needs the readiness of the scan.
   */
  staffedPools?: readonly string[]
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

    case 'time_of_day': {
      const minutes =
        facts.timeOfDay === undefined || facts.timeOfDay === null
          ? minutesOfDay(new Date())
          : wallClockMinutes(facts.timeOfDay)

      if (minutes === null) {
        return false
      }

      const within = listValue(leaf.value).some((interval) =>
        timeOfDayIntervalMatches(interval, minutes),
      )

      return leaf.operator === 'notIn' ? !within : within
    }

    case 'shift': {
      const staffed = facts.staffedPools

      // Without the readiness of the scan the leaf never matches: a rule that
      // asks for a staffed pool must not fire because nobody answered.
      if (staffed === undefined) {
        return false
      }

      const equals = staffed.includes(String(leaf.value))

      return leaf.operator === 'ne' ? !equals : equals
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

/**
 * The default chain of an installation with its names (§7.1, §7.11). The
 * first stage `new` is the arrival of the ticket: the workflow never reaches
 * it, so it hands its clock down to the stage `review` — the report.
 */
export const DEFAULT_WORKFLOW_ESCALATION_STAGES: readonly EscalationStageConfig[] = [
  {
    key: 'new',
    names: { de: 'Neu', en: 'New' },
    position: 1,
    active: true,
    predecessor: null,
    reachedBy: [],
  },
  {
    key: 'review',
    names: { de: 'Prüfung', en: 'Review' },
    position: 2,
    active: true,
    predecessor: 'new',
    reachedBy: ['review_started'],
  },
  {
    key: 'work_order',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    position: 3,
    active: true,
    predecessor: 'review',
    reachedBy: ['work_order_set'],
  },
  {
    key: 'assignment',
    names: { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' },
    position: 4,
    active: true,
    predecessor: 'work_order',
    reachedBy: ['assigned', 'offered'],
  },
  {
    key: 'acceptance',
    names: { de: 'Angenommen', en: 'Accepted' },
    position: 5,
    active: true,
    predecessor: 'assignment',
    reachedBy: ['accepted'],
  },
  {
    key: 'acknowledgement',
    names: { de: 'Quittiert', en: 'Acknowledged' },
    position: 6,
    active: true,
    predecessor: 'acceptance',
    reachedBy: ['acknowledged'],
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
    key: 'new#1',
    stageKey: 'new',
    reference: 'received_at',
    minutes: { low: 15, normal: 15, high: 15, critical: 5 },
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'review#1',
    stageKey: 'review',
    reference: 'received_at',
    minutes: { low: 15, normal: 15, high: 15, critical: 5 },
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'work_order#1',
    stageKey: 'work_order',
    reference: 'review_started',
    minutes: evenMinutes(30),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'assignment#1',
    stageKey: 'assignment',
    reference: 'work_order_set',
    minutes: evenMinutes(30),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acceptance#1',
    stageKey: 'acceptance',
    reference: 'offered',
    minutes: { low: 20, normal: 20, high: 20, critical: 10 },
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acceptance#2',
    stageKey: 'acceptance',
    reference: 'assigned',
    minutes: evenMinutes(15),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'acknowledgement#1',
    stageKey: 'acknowledgement',
    reference: 'accepted',
    minutes: evenMinutes(60),
    percent: null,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'deadline#1',
    stageKey: null,
    reference: null,
    minutes: null,
    percent: 80,
    condition: { all: [] },
    actions: [],
    active: true,
  },
  {
    key: 'deadline#2',
    stageKey: null,
    reference: null,
    minutes: null,
    percent: 100,
    condition: { all: [] },
    actions: [],
    active: true,
  },
]
