import { z } from 'zod'

/**
 * Schemas of the host update (`specs/18-self-update.md` §18.4–§18.6,
 * ADR-0006). The API validates every answer of the update agent with these
 * schemas, so a malformed answer becomes an error of the API and never a
 * crash. The agent itself uses the same schemas for its own protocol.
 */

/** Status of one update run; the same values as the `update_runs` table. */
export const UPDATE_RUN_STATUSES = ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'] as const

export const updateRunStatusSchema = z.enum(UPDATE_RUN_STATUSES)

export type UpdateRunStatus = z.infer<typeof updateRunStatusSchema>

/** Why a run did not succeed; fixed codes, never a translated text (§3). */
export const UPDATE_ERROR_CODES = [
  'update_git_failed',
  'update_compose_failed',
  'update_prune_failed',
  'update_agent_unreachable',
  'update_agent_not_configured',
  'update_rate_limited',
] as const

export const updateErrorCodeSchema = z.enum(UPDATE_ERROR_CODES)

export type UpdateErrorCode = z.infer<typeof updateErrorCodeSchema>

/** The three steps of a host update, in the order of ADR-0006. */
export const UPDATE_STEPS = ['git', 'compose', 'prune'] as const

export const updateStepSchema = z.enum(UPDATE_STEPS)

export type UpdateStep = z.infer<typeof updateStepSchema>

/** The state of the agent: idle, a run in progress or the last run failed. */
export const UPDATE_AGENT_STATES = ['idle', 'running', 'failed'] as const

export const updateAgentStateSchema = z.enum(UPDATE_AGENT_STATES)

export type UpdateAgentState = z.infer<typeof updateAgentStateSchema>

/**
 * Why the agent cannot be reached. The operator has to fix the cause, so the
 * answer of the status route names it instead of a plain "not reachable".
 */
export const UPDATE_AGENT_ERROR_CODES = [
  'update_agent_not_configured',
  'update_agent_unreachable',
  'update_agent_bad_response',
] as const

export const updateAgentErrorSchema = z.enum(UPDATE_AGENT_ERROR_CODES)

export type UpdateAgentErrorReason = z.infer<typeof updateAgentErrorSchema>

/** One step of a run with its result. */
export const updateStepResultSchema = z.object({
  step: updateStepSchema,
  status: z.enum(['ok', 'failed', 'skipped']),
  errorCode: z.string().nullable(),
})

export type UpdateStepResult = z.infer<typeof updateStepResultSchema>

/** One run as the agent reports it. */
export const agentRunSchema = z.object({
  id: z.string().min(1),
  status: updateRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  beforeVersion: z.string().nullable(),
  afterVersion: z.string().nullable(),
  errorCode: z.string().nullable(),
  steps: z.array(updateStepResultSchema),
})

export type AgentRun = z.infer<typeof agentRunSchema>

/** The answer of the agent on `GET /status` (§18.6). */
export const agentStatusSchema = z.object({
  state: updateAgentStateSchema,
  checkout: z.object({
    version: z.string().nullable(),
    commit: z.string().nullable(),
  }),
  lastRun: agentRunSchema.nullable(),
})

export type AgentStatus = z.infer<typeof agentStatusSchema>

/** One stored run row of the `update_runs` table. */
export const updateRunSchema = z.object({
  id: z.string().uuid(),
  status: updateRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  beforeVersion: z.string().nullable(),
  afterVersion: z.string().nullable(),
  errorCode: z.string().nullable(),
})

export type UpdateRun = z.infer<typeof updateRunSchema>

/** The answer of `GET /api/v1/admin/update/status`. */
export const updateStatusResponseSchema = z.object({
  agent: z.object({
    reachable: z.boolean(),
    state: updateAgentStateSchema.nullable(),
    /** Why the agent is not reachable; `null` when it answers. */
    error: updateAgentErrorSchema.nullable(),
  }),
  running: z.boolean(),
  currentVersion: z.string().nullable(),
  lastRun: updateRunSchema.nullable(),
})

export type UpdateStatusResponse = z.infer<typeof updateStatusResponseSchema>

/** The answer of `POST /api/v1/admin/update/run`. */
export const updateRunResponseSchema = z.object({
  run: updateRunSchema,
})

export type UpdateRunResponse = z.infer<typeof updateRunResponseSchema>

/** The answer of `GET /api/v1/admin/update/runs`. */
export const updateRunsResponseSchema = z.object({
  runs: z.array(updateRunSchema),
})

export type UpdateRunsResponse = z.infer<typeof updateRunsResponseSchema>
