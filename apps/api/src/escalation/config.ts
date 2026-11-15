import { asc, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  escalationConfigSchema,
  escalationRuleConfigSchema,
  escalationStagesBodySchema,
  validateEscalationStageChain,
  type EscalationActionConfig,
  type EscalationConfig,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { escalationActions, escalationRules, escalationStages } from '../db/schema'
import { TRANSITION_EVENT_KEYS, TRANSITIONS } from '../tickets/workflow'

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
      return { channels: action.channels }
    case 'webhook':
      return { endpointIds: action.endpointIds }
    case 'history':
      return action.text === undefined ? {} : { text: action.text }
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
 * The stages the ticket can still reach, with the events that reach them. The
 * ticket view offers them instead of one button per workflow step
 * (`specs/07-escalation.md` §7.10). A stage qualifies when one of its
 * `reached_by` events is a transition the current status allows (ADR-0023).
 */
export async function readReachableStages(
  database: Db,
  status: string,
): Promise<{ key: string; names: Record<string, string>; events: string[] }[]> {
  const allowedEvents = new Set([
    ...Object.keys(TRANSITIONS[status] ?? {}),
    ...Object.keys(TRANSITIONS['*'] ?? {}),
  ])
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
      const clockEvents =
        stage.predecessor === null
          ? ['received_at']
          : (stageByKey.get(stage.predecessor)?.reachedBy ?? [])

      if (!clockEvents.includes(rule.reference)) {
        invalidFields.push(`rules.${index}.reference`)
      }
    }
  }

  if (invalidFields.length > 0) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: invalidFields })
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
    TRANSITION_EVENT_KEYS,
  )

  if (chainIssues.length > 0) {
    throw new EscalationConfigError(400, 'invalid_request', { fields: chainIssues })
  }

  const keys = parsed.data.stages.map((stage) => stage.key)
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
    const chainByKey = new Map(chainRows.map((stage) => [stage.key, stage]))

    for (const rule of ruleRows) {
      if (rule.stageKey === null || rule.reference === null) {
        continue
      }

      const stage = chainByKey.get(rule.stageKey)
      const clockEvents =
        stage === undefined
          ? []
          : stage.predecessor === null
            ? ['received_at']
            : (chainByKey.get(stage.predecessor)?.reachedBy ?? [])

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
