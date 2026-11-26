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
import {
  escalationActions,
  escalationRules,
  escalationStages,
  groups,
  oncallPools,
  ticketStatuses,
  users,
} from '../db/schema'
import { WORKFLOW_EVENT_STATUS } from '../tickets/workflow'

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

/**
 * The body of `PUT /api/v1/escalation/config`: the rules with their actions
 * (§7.14, ADR-0057). The pool of the office is gone — the assignment names a
 * target of the installation.
 */
export const escalationRulesBodySchema = z.object({
  rules: z.array(escalationRuleConfigSchema).max(50),
})

function actionConfig(action: EscalationActionConfig): Record<string, unknown> {
  switch (action.type) {
    case 'notify':
      return {
        ...(action.channels === undefined ? {} : { channels: action.channels }),
        // The targets `assigned` and `assigner` carry no id: the dispatcher
        // reads them from the ticket when the rule fires (§7.14, ADR-0039).
        ...(action.target === undefined
          ? {}
          : action.target.kind === 'user' || action.target.kind === 'pool'
            ? { target: { kind: action.target.kind, id: action.target.id } }
            : { target: { kind: action.target.kind } }),
        ...(action.priority === undefined ? {} : { priority: action.priority }),
      }
    case 'webhook':
      return { endpointIds: action.endpointIds }
    case 'history':
      return action.text === undefined ? {} : { text: action.text }
    case 'status_change':
      return { toStatus: action.toStatus }
    case 'offer':
      return { target: { kind: action.target.kind, id: action.target.id } }
    case 'assign':
      return {
        target: { kind: action.target.kind, id: action.target.id },
        acceptance: action.acceptance,
      }
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
 * The workflow event keys an installation knows (`tickets/workflow.ts`). The
 * stages may name them and nothing else.
 */
function readTransitionEventKeys(): string[] {
  return Object.keys(WORKFLOW_EVENT_STATUS)
}

/**
 * The stages with the events that reach them. The ticket view offers them instead
 * of one button per workflow step (`specs/07-escalation.md` §7.10). There is no
 * status condition: a stage is reachable by its events, the history documents the
 * change (ADR-0027).
 */
export async function readReachableStages(
  database: Db,
): Promise<{ key: string; names: Record<string, string>; events: string[] }[]> {
  const stages = await readEscalationStages(database)

  return stages.flatMap((stage) => {
    if (!stage.active) {
      return []
    }

    const events = stage.reachedBy.filter((event) => event in WORKFLOW_EVENT_STATUS)

    return events.length === 0 ? [] : [{ key: stage.key, names: stage.names, events }]
  })
}

/**
 * The rows of an installation that was written before the current contract
 * (`specs/07-escalation.md` §7.9, ADR-0063): the read of the administration and
 * of the escalation scan brings them into the contract instead of losing the
 * whole configuration —
 *
 * - an empty condition of a rule or of an action (`{}`, `null` or a missing key)
 *   becomes the empty condition of §7.4 (`{ all: [] }`), the default of the rows
 *   of `escalation_rules` and `escalation_actions`;
 * - the `assign` action of the former shape names its mode and the technician of
 *   the pool of the office (ADR-0039, decision 3); the technician becomes a
 *   target of the kind `user`, an action that named the pool of the office is
 *   dropped — the rule of the migration of WP-M32-05;
 * - a `notify` action without a recipient (neither channels nor a target) is
 *   dropped — it can never deliver, the rule of `notify_needs_target_or_channel`;
 * - the flag `acceptance` of the former shape carried a text, the contract
 *   carries a boolean;
 * - a rule that carries both clocks keeps the clock its stage says: a stage rule
 *   waits with its minutes, a deadline rule with its percentage (§7.2, §7.5);
 * - the reference of a stage rule that does not match the clock of its stage
 *   becomes `null` — the stage clock, the fallback of `writeEscalationStages`
 *   (ADR-0023, §7.11);
 * - a stage without a name for a required locale takes the key of the stage, the
 *   fallback of `localizedName`; a stage with the position of `0` (the default of
 *   the row) takes its place in the order.
 *
 * A row that cannot be brought into the contract stays as it is and is answered
 * with the code `config_invalid` by the caller — never as a bare server error.
 */
export function normalizeEscalationRows(
  stages: Record<string, unknown>[],
  rules: Record<string, unknown>[],
): { stages: Record<string, unknown>[]; rules: Record<string, unknown>[] } {
  const normalizedStages: Record<string, unknown>[] = stages.map((stage, index) => {
    const names = { ...((stage.names ?? {}) as Record<string, string>) }

    for (const locale of ['de', 'en'] as const) {
      if ((names[locale] ?? '').trim() === '') {
        names[locale] = String(stage.key ?? '')
      }
    }

    const position = Number(stage.position ?? 0)

    return {
      ...stage,
      names,
      position: Number.isInteger(position) && position >= 1 ? position : index + 1,
    }
  })

  const clockRows: { key: string; predecessor: string | null; reachedBy: readonly string[] }[] =
    normalizedStages.map((stage) => ({
      key: String(stage.key ?? ''),
      predecessor:
        stage.predecessor === null || stage.predecessor === undefined
          ? null
          : String(stage.predecessor),
      reachedBy: (stage.reachedBy ?? []) as unknown as readonly string[],
    }))

  const normalizedRules = rules.map((rule) => {
    const stageKey =
      rule.stageKey === null || rule.stageKey === undefined ? null : String(rule.stageKey)
    const actions = ((rule.actions ?? []) as unknown as Record<string, unknown>[])
      .map(normalizeEscalationAction)
      .flatMap((action) => (action === undefined ? [] : [action]))

    let minutes = rule.minutes
    let percent = rule.percent

    if (minutes !== null && percent !== null) {
      if (stageKey === null) {
        minutes = null
      } else {
        percent = null
      }
    }

    let reference = rule.reference

    if (stageKey !== null && reference !== null) {
      const clock = escalationStageClockEvents(stageKey, clockRows)

      if (!clock.includes(String(reference))) {
        reference = null
      }
    }

    return {
      ...rule,
      actions,
      minutes,
      percent,
      reference,
      condition: conditionOfRuleRow(rule.condition),
    }
  })

  return { stages: normalizedStages, rules: normalizedRules }
}

/** An empty condition of a legacy row (`{}`, `null`, a missing key) is `{ all: [] }`. */
function conditionOfRuleRow(condition: unknown): unknown {
  if (condition === null || condition === undefined) {
    return { all: [] as unknown[] }
  }

  if (typeof condition !== 'object' || Array.isArray(condition)) {
    return { all: [] as unknown[] }
  }

  const tree = condition as Record<string, unknown>

  return 'all' in tree || 'any' in tree || 'field' in tree ? condition : { all: [] as unknown[] }
}

/**
 * One action of a legacy rule (ADR-0063): `undefined` means an action that is
 * dropped — it names no recipient or the pool of the office that no longer
 * exists.
 */
function normalizeEscalationAction(
  action: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const type = action.type
  const normalized: Record<string, unknown> = {
    ...action,
    condition: conditionOfRuleRow(action.condition),
  }

  if ('acceptance' in normalized) {
    normalized.acceptance = normalized.acceptance !== false && normalized.acceptance !== 'false'
  }

  if (type === 'assign') {
    const target = normalized.target as { kind?: string; id?: string } | undefined
    const knownTarget =
      target !== undefined &&
      (target.kind === 'pool' || target.kind === 'group' || target.kind === 'user') &&
      typeof target.id === 'string'

    if (knownTarget) {
      return normalized
    }

    if (typeof normalized.user === 'string') {
      return { ...normalized, target: { kind: 'user', id: normalized.user } }
    }

    return undefined
  }

  if (type === 'notify') {
    const channels = normalized.channels
    const hasChannels = Array.isArray(channels) && channels.length > 0

    if (normalized.target === undefined && !hasChannels) {
      return undefined
    }
  }

  return normalized
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

  const normalized = normalizeEscalationRows(stages, rules)
  const parsed = escalationConfigSchema.safeParse({
    stages: normalized.stages,
    rules: normalized.rules,
  })

  if (!parsed.success) {
    throw new EscalationConfigError(500, 'config_invalid', { fields: fieldPaths(parsed.error) })
  }

  return parsed.data
}

/**
 * Replaces the rules and their actions in one transaction. The rules of a
 * stage that does not exist are rejected; the key of a rule is its identity,
 * so the firing log of the former rules stays readable.
 */
export async function writeEscalationConfig(
  database: Db,
  body: unknown,
): Promise<EscalationConfig> {
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
  const statusKeyRows = await database.select({ key: ticketStatuses.key }).from(ticketStatuses)
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
  // (kind `pool`), of `groups` (kind `group`) or of `users` (kind `user`,
  // ADR-0033): the jsonb of the action carries no foreign key, so the service
  // checks it and answers `400 invalid_target` with the field path — the rule
  // of the `status_change` target above.
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
        // The targets `assigned` and `assigner` name no row: the dispatcher
        // reads them from the ticket (§7.14, ADR-0039).
        if (action.target.kind === 'assigned' || action.target.kind === 'assigner') {
          continue
        }

        const known = action.target.kind === 'pool' ? poolIds : userIds

        if (!known.has(action.target.id)) {
          unknownTargetFields.push(`rules.${ruleIndex}.actions.${actionIndex}.target.id`)
        }

        continue
      }

      if (action.type === 'assign') {
        // The target of the assignment names a row of `oncall_pools` (kind
        // `pool`), of `groups` (kind `group`) or of `users` (kind `user`,
        // ADR-0057) — the rule of the target of an `offer` action above.
        const known =
          action.target.kind === 'pool'
            ? poolIds
            : action.target.kind === 'user'
              ? userIds
              : groupIds

        if (!known.has(action.target.id)) {
          unknownTargetFields.push(`rules.${ruleIndex}.actions.${actionIndex}.target.id`)
        }

        continue
      }

      if (action.type !== 'offer') {
        continue
      }

      const known =
        action.target.kind === 'pool' ? poolIds : action.target.kind === 'user' ? userIds : groupIds

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
 * validated against the workflow events before anything is written.
 */
export async function writeEscalationStages(
  database: Db,
  body: unknown,
): Promise<EscalationConfig> {
  const parsed = escalationStagesBodySchema.safeParse(body)

  if (!parsed.success) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
  }

  const chainIssues = validateEscalationStageChain(parsed.data.stages, readTransitionEventKeys())

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
