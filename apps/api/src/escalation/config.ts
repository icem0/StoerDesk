import { asc, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  ESCALATION_DEADLINE_ROOT,
  escalationActionKey,
  escalationConditionLeaves,
  escalationConfigSchema,
  escalationFirstStageKey,
  escalationRuleConfigSchema,
  escalationRuleKey,
  escalationStageClockEvents,
  escalationStagesBodySchema,
  validateEscalationStageChain,
  type EscalationActionConfig,
  type EscalationConfig,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { escalationActions, escalationRules, escalationStages, groups, oncallPools, ticketStatuses, users } from '../db/schema'
import { readTicketTransitions } from '../tickets/transition-service'

/**
 * The configuration of the escalation (`specs/07-escalation.md` §7.9,
 * ADR-0017, WP-M13-05).
 *
 * The stages, the rules and their actions live in the database; the `key` is
 * the identity of a row, not its UUID, so the administration sends the keys and
 * the server keeps the rows stable. The rules and their actions are replaced in
 * one transaction. The whole stage chain is replaced in one transaction as well
 * (ADR-0023): a submitted key is created or updated, a missing key is deleted.
 */

type Db = Database['database']

export class EscalationConfigError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'EscalationConfigError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function fieldPaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

/** The body of `PUT /api/v1/escalation/config`: the rules with their actions. */
export const escalationRulesBodySchema = z.object({
  rules: z.array(escalationRuleConfigSchema).max(50),
})

function actionConfig(action: EscalationActionConfig): Record<string, unknown> {
  switch (action.type) {
    case 'notify':
      return {
        ...(action.channels === undefined ? {} : { channels: action.channels }),
        ...(action.target === undefined
          ? {}
          : { target: { kind: action.target.kind, id: action.target.id } }),
        ...(action.priority === undefined ? {} : { priority: action.priority }),
      }
    case 'webhook':
      return { endpointIds: action.endpointIds }
    case 'history':
      return action.text === undefined ? {} : { text: action.text }
    case 'status_change':
      return { toStatus: action.toStatus }
    case 'offer':
    case 'assign':
      return { target: { kind: action.target.kind, id: action.target.id } }
    default:
      return {}
  }
}

/** Reads the stage chain with its names, ordered by the positions. */
export async function readEscalationStages(database: Db): Promise<
  {
    key: string
    names: Record<string, string>
    position: number
    active: boolean
    predecessor: string | null
    reachedBy: string[]
  }[]
> {
  const rows = await database
    .select()
    .from(escalationStages)
    .orderBy(asc(escalationStages.position))

  return rows.map((row) => ({
    key: row.key,
    names: row.names as Record<string, string>,
    position: row.position,
    active: row.active,
    predecessor: row.predecessor,
    reachedBy: row.reachedBy,
  }))
}

/**
 * The event keys of the transition table — the workflow events an installation
 * knows (ADR-0025). The stages may name them and nothing else.
 */
async function readTransitionEventKeys(database: Db): Promise<string[]> {
  const transitions = await readTicketTransitions(database)

  return [...new Set(transitions.map((transition) => transition.eventKey))]
}

/**
 * The stages the ticket can still reach, with the events that reach them. The
 * ticket view offers them instead of one button per workflow step
 * (`specs/07-escalation.md` §7.10). A stage qualifies when one of its
 * `reached_by` events is a step the current status allows: the **active** rows
 * of `ticket_transitions` whose `from_status` is that status (ADR-0025). The
 * table is the only source of truth, so an administrator who deactivates a step
 * or changes its source status never sees a stage the engine would reject.
 */
export async function readReachableStages(
  database: Db,
  status: string,
): Promise<{ key: string; names: Record<string, string>; events: string[] }[]> {
  const transitions = await readTicketTransitions(database)
  const allowedEvents = new Set(
    transitions
      .filter((transition) => transition.active && transition.fromStatus === status)
      .map((transition) => transition.eventKey),
  )
  const stages = await readEscalationStages(database)

  return stages.flatMap((stage) => {
    if (!stage.active) {
      return []
    }

    const events = stage.reachedBy.filter((event) => allowedEvents.has(event))

    return events.length === 0
      ? []
      : [{ key: stage.key, names: stage.names, events }]
  })
}

/** Reads the whole configuration: the stages, the rules and their actions. */
export async function readEscalationConfig(database: Db): Promise<EscalationConfig> {
  const [stageRows, ruleRows, actionRows] = await Promise.all([
    database.select().from(escalationStages).orderBy(asc(escalationStages.position)),
    database.select().from(escalationRules).orderBy(asc(escalationRules.position)),
    database.select().from(escalationActions).orderBy(asc(escalationActions.position)),
  ])

  const actionsByRule = new Map<string, unknown[]>()

  for (const row of actionRows) {
    const config = (row.config ?? {}) as Record<string, unknown>
    const action = {
      key: row.key,
      type: row.type,
      condition: row.condition,
      ...config,
    }

    const list = actionsByRule.get(row.ruleKey) ?? []
    list.push(action)
    actionsByRule.set(row.ruleKey, list)
  }

  const stages = stageRows.map((row) => ({
    key: row.key,
    names: row.names,
    position: row.position,
    active: row.active,
    predecessor: row.predecessor,
    reachedBy: row.reachedBy,
  }))

  const rules = ruleRows.map((row) => ({
    key: row.key,
    stageKey: row.stageKey,
    reference: row.reference,
    minutes: row.minutes,
    percent: row.percent,
    condition: row.condition,
    actions: actionsByRule.get(row.key) ?? [],
    active: row.active,
  }))

  return escalationConfigSchema.parse({ stages, rules })
}

/**
 * Replaces the rules and their actions in one transaction. The rules of a
 * stage that does not exist are rejected; the key of a rule is its identity,
 * so the firing log of the former rules stays readable.
 */
export async function writeEscalationConfig(database: Db, body: unknown): Promise<EscalationConfig> {
  const parsed = escalationRulesBodySchema.safeParse(body)

  if (!parsed.success) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
  }

  const stageRows = await database
    .select({
      key: escalationStages.key,
      predecessor: escalationStages.predecessor,
      reachedBy: escalationStages.reachedBy,
    })
    .from(escalationStages)
  const stageByKey = new Map(stageRows.map((row) => [row.key, row]))

  const invalidFields: string[] = []

  for (const [index, rule] of parsed.data.rules.entries()) {
    if (rule.stageKey === null) {
      continue
    }

    const stage = stageByKey.get(rule.stageKey)

    if (stage === undefined) {
      invalidFields.push(`rules.${index}.stageKey`)
      continue
    }

    if (rule.reference !== null) {
      const clockEvents = escalationStageClockEvents(rule.stageKey, stageRows)

      if (!clockEvents.includes(rule.reference)) {
        invalidFields.push(`rules.${index}.reference`)
      }
    }
  }

  if (invalidFields.length > 0) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: invalidFields })
  }

  // The target of a `status_change` action names a row of `ticket_statuses`
  // (WP-M14-40b, the service rule of WP-M14-39 on the escalation side): the jsonb
  // `config` of the action cannot carry a foreign key (WP-M14-40), so the service
  // checks it and answers `400 invalid_status_key` with the field path.
  const statusKeyRows = await database
    .select({ key: ticketStatuses.key })
    .from(ticketStatuses)
  const statusKeys = new Set(statusKeyRows.map((row) => row.key))
  const unknownStatusFields: string[] = []

  for (const [ruleIndex, rule] of parsed.data.rules.entries()) {
    for (const [actionIndex, action] of rule.actions.entries()) {
      if (action.type === 'status_change' && !statusKeys.has(action.toStatus)) {
        unknownStatusFields.push(`rules.${ruleIndex}.actions.${actionIndex}.toStatus`)
      }
    }
  }

  if (unknownStatusFields.length > 0) {
    throw new EscalationConfigError(400, 'invalid_status_key', { fields: unknownStatusFields })
  }

  // The target of an `offer` or an `assign` action names a row of `oncall_pools`
  // (kind `pool`) or of `groups` (kind `group`) (§7.14, ADR-0026): the jsonb of
  // the action carries no foreign key, so the service checks it and answers
  // `400 invalid_target` with the field path — the rule of the `status_change`
  // target above.
  const poolRows = await database.select({ id: oncallPools.id }).from(oncallPools)
  const groupRows = await database.select({ id: groups.id }).from(groups)
  const userRows = await database.select({ id: users.id }).from(users)
  const poolIds = new Set(poolRows.map((row) => row.id))
  const groupIds = new Set(groupRows.map((row) => row.id))
  const userIds = new Set(userRows.map((row) => row.id))
  const unknownTargetFields: string[] = []

  for (const [ruleIndex, rule] of parsed.data.rules.entries()) {
    for (const [actionIndex, action] of rule.actions.entries()) {
      if (action.type === 'notify' && action.target !== undefined) {
        const known = action.target.kind === 'pool' ? poolIds : userIds

        if (!known.has(action.target.id)) {
          unknownTargetFields.push(`rules.${ruleIndex}.actions.${actionIndex}.target.id`)
        }

        continue
      }

      if (action.type !== 'offer' && action.type !== 'assign') {
        continue
      }

      const known = action.target.kind === 'pool' ? poolIds : groupIds

      if (!known.has(action.target.id)) {
        unknownTargetFields.push(`rules.${ruleIndex}.actions.${actionIndex}.target.id`)
      }
    }
  }

  if (unknownTargetFields.length > 0) {
    throw new EscalationConfigError(400, 'invalid_target', { fields: unknownTargetFields })
  }

  // The condition of a rule may ask for a readiness pool (§7.4, ADR-0030): the
  // jsonb of the condition carries no foreign key, so the service checks the
  // pool — the rule of the target of an action above.
  const unknownPoolFields: string[] = []

  for (const [ruleIndex, rule] of parsed.data.rules.entries()) {
    for (const leaf of escalationConditionLeaves(rule.condition)) {
      if (leaf.field === 'shift' && !poolIds.has(String(leaf.value))) {
        unknownPoolFields.push(`rules.${ruleIndex}.condition`)
      }
    }

    for (const [actionIndex, action] of rule.actions.entries()) {
      for (const leaf of escalationConditionLeaves(action.condition)) {
        if (leaf.field === 'shift' && !poolIds.has(String(leaf.value))) {
          unknownPoolFields.push(`rules.${ruleIndex}.actions.${actionIndex}.condition`)
        }
      }
    }
  }

  if (unknownPoolFields.length > 0) {
    throw new EscalationConfigError(400, 'invalid_target', { fields: unknownPoolFields })
  }

  await database.transaction(async (tx) => {
    await tx.delete(escalationRules)

    // The taxonomy of §7.5: the key of a rule is the key of its stage and its
    // number, the key of an action the key of its rule and its number. The
    // server writes both keys — the administration only numbers them.
    const ruleNumbers = new Map<string, number>()
    const derivedKeys = new Set<string>()

    for (const [position, rule] of parsed.data.rules.entries()) {
      const group = rule.stageKey ?? ESCALATION_DEADLINE_ROOT
      const number = (ruleNumbers.get(group) ?? 0) + 1

      ruleNumbers.set(group, number)

      const ruleKey = escalationRuleKey(rule.stageKey, number)

      if (derivedKeys.has(ruleKey)) {
        throw new EscalationConfigError(400, 'invalid_request', {
          fields: [`rules.${position}.key`],
        })
      }

      derivedKeys.add(ruleKey)

      await tx.insert(escalationRules).values({
        key: ruleKey,
        stageKey: rule.stageKey,
        reference: rule.reference,
        minutes: rule.minutes,
        percent: rule.percent,
        condition: rule.condition,
        position,
        active: rule.active,
      })

      for (const [actionPosition, action] of rule.actions.entries()) {
        await tx.insert(escalationActions).values({
          key: escalationActionKey(ruleKey, actionPosition + 1),
          ruleKey,
          type: action.type,
          config: actionConfig(action),
          condition: action.condition,
          position: actionPosition,
          active: true,
        })
      }
    }
  })

  return readEscalationConfig(database)
}

/**
 * Replaces the whole stage chain in one transaction. A submitted key is
 * created or updated; a stage that is missing from the body is deleted and
 * its rules follow through the `ON DELETE cascade` of §7.11. The chain is
 * validated against the transition map before anything is written.
 */
export async function writeEscalationStages(
  database: Db,
  body: unknown,
): Promise<EscalationConfig> {
  const parsed = escalationStagesBodySchema.safeParse(body)

  if (!parsed.success) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
  }

  const chainIssues = validateEscalationStageChain(
    parsed.data.stages,
    await readTransitionEventKeys(database),
  )

  if (chainIssues.length > 0) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: chainIssues })
  }

  const keys = parsed.data.stages.map((stage) => stage.key)

  // The first stage is the anchor of the chain: it carries the clock of the
  // ticket and its rules fire at creation (WP-M14-91). It cannot be removed or
  // demoted to a later stage (WP-M14-92). A chain has exactly one such stage
  // (WP-M14-105) — a second stage without a predecessor may be removed.
  const existingStages = await database
    .select({
      key: escalationStages.key,
      position: escalationStages.position,
      predecessor: escalationStages.predecessor,
    })
    .from(escalationStages)
  const firstStageKey = escalationFirstStageKey(existingStages)

  if (firstStageKey !== null) {
    const submitted = parsed.data.stages.find((stage) => stage.key === firstStageKey)

    if (submitted === undefined || submitted.predecessor !== null) {
      throw new EscalationConfigError(400, 'invalid_request', { fields: ['stages'] })
    }
  }

  const updatedAt = new Date()

  await database.transaction(async (tx) => {
    for (const stage of parsed.data.stages) {
      await tx
        .insert(escalationStages)
        .values({
          key: stage.key,
          names: stage.names,
          position: stage.position,
          active: stage.active,
          predecessor: stage.predecessor,
          reachedBy: stage.reachedBy,
        })
        .onConflictDoUpdate({
          target: escalationStages.key,
          set: {
            names: stage.names,
            position: stage.position,
            active: stage.active,
            predecessor: stage.predecessor,
            reachedBy: stage.reachedBy,
            updatedAt,
          },
        })
    }

    if (keys.length === 0) {
      await tx.delete(escalationStages)
    } else {
      await tx.delete(escalationStages).where(notInArray(escalationStages.key, keys))
    }

    // A predecessor change moves the clock of its stage. An explicit reference
    // that no longer matches the new clock falls back to the stage clock
    // (`reference = null`), so the written chain and the existing rules stay a
    // readable configuration (ADR-0023, §7.11).
    const [chainRows, ruleRows] = await Promise.all([
      tx
        .select({
          key: escalationStages.key,
          predecessor: escalationStages.predecessor,
          reachedBy: escalationStages.reachedBy,
        })
        .from(escalationStages),
      tx
        .select({
          key: escalationRules.key,
          stageKey: escalationRules.stageKey,
          reference: escalationRules.reference,
        })
        .from(escalationRules),
    ])
    for (const rule of ruleRows) {
      if (rule.stageKey === null || rule.reference === null) {
        continue
      }

      const clockEvents = escalationStageClockEvents(rule.stageKey, chainRows)

      if (!clockEvents.includes(rule.reference)) {
        await tx
          .update(escalationRules)
          .set({ reference: null, updatedAt })
          .where(eq(escalationRules.key, rule.key))
      }
    }
  })

  return readEscalationConfig(database)
}
