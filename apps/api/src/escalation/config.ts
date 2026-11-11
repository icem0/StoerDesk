import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  ESCALATION_STAGE_KEYS,
  escalationConfigSchema,
  escalationRuleConfigSchema,
  escalationStageConfigSchema,
  type EscalationActionConfig,
  type EscalationConfig,
  type EscalationStageKey,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { escalationActions, escalationRules, escalationStages } from '../db/schema'

/**
 * The configuration of the escalation (`specs/07-escalation.md` §7.9,
 * ADR-0017, WP-M13-05).
 *
 * The stages, the rules and their actions live in the database; the `key` is
 * the identity of a row, not its UUID, so the administration sends the keys and
 * the server keeps the rows stable. The rules and their actions are replaced in
 * one transaction; the stages keep their fixed keys and change their names,
 * their position and their active flag.
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

/** The body of `PUT /api/v1/escalation/stages`: the five stages. */
export const escalationStagesBodySchema = z.object({
  stages: z.array(escalationStageConfigSchema).max(ESCALATION_STAGE_KEYS.length),
})

function actionConfig(action: EscalationActionConfig): Record<string, unknown> {
  switch (action.type) {
    case 'notify':
      return { channels: action.channels }
    case 'webhook':
      return { endpointIds: action.endpointIds }
    case 'history':
      return action.text === undefined ? {} : { text: action.text }
    default:
      return {}
  }
}

/**
 * The stages a ticket can still reach, by its status. The stage is a
 * milestone of the workflow; the variants are the events that reach it (the
 * stage "assignment" is reached by an assignment and by an offer).
 */
export const ESCALATION_REACHABLE_STAGES: Record<string, readonly EscalationStageKey[]> = {
  NEW: ['review'],
  IN_REVIEW: ['work_order'],
  WORK_ORDER_CREATED: ['assignment'],
  OFFERED: ['acceptance'],
  ASSIGNED: ['acceptance'],
  ACCEPTED: ['acknowledgement'],
  ACKNOWLEDGED: [],
  CLOSED: [],
  CANCELLED: [],
}

/** The events that reach a stage of the workflow. */
export const ESCALATION_STAGE_EVENTS: Record<EscalationStageKey, readonly string[]> = {
  review: ['review_started'],
  work_order: ['work_order_set'],
  assignment: ['assigned', 'offered'],
  acceptance: ['accepted'],
  acknowledgement: ['acknowledged'],
}

/** Reads the five stages with their names, ordered by their position. */
export async function readEscalationStages(database: Db): Promise<
  { key: string; names: Record<string, string>; position: number; active: boolean }[]
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
  }))
}

/**
 * The stages the ticket can still reach, with the events that reach them. The
 * ticket view offers them instead of one button per workflow step
 * (`specs/07-escalation.md` §7.10).
 */
export async function readReachableStages(
  database: Db,
  status: string,
): Promise<{ key: string; names: Record<string, string>; events: string[] }[]> {
  const reachable = ESCALATION_REACHABLE_STAGES[status] ?? []
  const stages = await readEscalationStages(database)
  const byKey = new Map(stages.map((stage) => [stage.key, stage]))

  return reachable.flatMap((key) => {
    const stage = byKey.get(key)

    if (stage === undefined) {
      return []
    }

    return [{ key, names: stage.names, events: [...ESCALATION_STAGE_EVENTS[key]] }]
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

  const stageRows = await database.select({ key: escalationStages.key }).from(escalationStages)
  const stageKeys = new Set(stageRows.map((row) => row.key))

  for (const [index, rule] of parsed.data.rules.entries()) {
    if (rule.stageKey !== null && !stageKeys.has(rule.stageKey)) {
      throw new EscalationConfigError(400, 'invalid_request', {
        fields: [`rules.${index}.stageKey`],
      })
    }
  }

  await database.transaction(async (tx) => {
    await tx.delete(escalationRules)

    for (const [position, rule] of parsed.data.rules.entries()) {
      await tx.insert(escalationRules).values({
        key: rule.key,
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
          key: action.key,
          ruleKey: rule.key,
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
 * Replaces the names, the position and the active flag of the stages. Their
 * keys are fixed by the workflow: a body with an unknown key or with a missing
 * stage is rejected.
 */
export async function writeEscalationStages(
  database: Db,
  body: unknown,
): Promise<EscalationConfig> {
  const parsed = escalationStagesBodySchema.safeParse(body)

  if (!parsed.success) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
  }

  const keys = parsed.data.stages.map((stage) => stage.key)

  if (
    keys.length !== ESCALATION_STAGE_KEYS.length ||
    ESCALATION_STAGE_KEYS.some((key) => !keys.includes(key))
  ) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: ['stages'] })
  }

  await database.transaction(async (tx) => {
    for (const stage of parsed.data.stages) {
      await tx
        .update(escalationStages)
        .set({
          names: stage.names,
          position: stage.position,
          active: stage.active,
          updatedAt: new Date(),
        })
        .where(eq(escalationStages.key, stage.key))
    }
  })

  return readEscalationConfig(database)
}
