import { readFile } from 'node:fs/promises'

import { z } from 'zod'

import { agentRunSchema, agentStatusSchema, type AgentRun, type AgentStatus } from '@stoerdesk/shared'

/**
 * Client of the host update agent (`specs/18-self-update.md` §18.4–§18.6,
 * ADR-0006).
 *
 * The API is a client only: it never runs `git`, `docker` or a shell. It calls
 * the agent over the internal network with the bearer `UPDATE_AGENT_TOKEN` and
 * validates every answer with the shared schemas, so a malformed answer becomes
 * an error of the API and never a crash. The token never appears in an error,
 * an answer or a log line.
 *
 * The bearer comes from the environment or from the state volume of the agent:
 * the agent writes its token there, so the operator configures nothing. The
 * volume is mounted read-only, the API never writes it.
 */

export interface UpdateAgentConfig {
  /** The address of the agent inside the compose network. */
  baseUrl: string
  /** The bearer of the agent; an empty value falls back to the token file. */
  token: string
  /** The token file of the shared state volume. */
  tokenFile?: string
  /** The timeout of one call in milliseconds. */
  timeoutMs?: number
}

export type UpdateAgentErrorCode =
  | 'update_agent_not_configured'
  | 'update_agent_unreachable'
  | 'update_agent_bad_response'
  | 'update_already_running'

export class UpdateAgentError extends Error {
  readonly code: UpdateAgentErrorCode

  constructor(code: UpdateAgentErrorCode, message: string) {
    super(message)
    this.name = 'UpdateAgentError'
    this.code = code
  }
}

export interface UpdateAgentClient {
  /** The state of the agent and its last run. */
  status(): Promise<AgentStatus>
  /** Starts one run; the agent answers before the rebuild starts. */
  run(): Promise<AgentRun>
  /** The runs the agent knows. */
  runs(): Promise<AgentRun[]>
}

const DEFAULT_TIMEOUT_MS = 5000

const agentRunsSchema = z.object({ runs: z.array(agentRunSchema) })

/**
 * The bearer of the agent: the environment wins, otherwise the token file of
 * the shared state volume. An empty value means that no agent is configured —
 * the agent has not written its token yet.
 */
export async function resolveAgentToken(config: UpdateAgentConfig): Promise<string> {
  const fromEnv = config.token.trim()

  if (fromEnv !== '') {
    return fromEnv
  }

  if (config.tokenFile === undefined || config.tokenFile === '') {
    return ''
  }

  try {
    const content = await readFile(config.tokenFile, 'utf8')

    return content.trim()
  } catch {
    return ''
  }
}

export function createUpdateAgentClient(
  config: UpdateAgentConfig,
  fetchImpl: typeof fetch = fetch,
): UpdateAgentClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await resolveAgentToken(config)

    if (token === '') {
      throw new UpdateAgentError('update_agent_not_configured', 'the update agent has no token')
    }

    let response: Response

    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new UpdateAgentError('update_agent_unreachable', 'the update agent is not reachable')
    }

    if (response.status === 409) {
      throw new UpdateAgentError('update_already_running', 'a run is already active')
    }

    if (!response.ok) {
      throw new UpdateAgentError('update_agent_unreachable', 'the update agent refused the call')
    }

    try {
      return await response.json()
    } catch {
      throw new UpdateAgentError('update_agent_bad_response', 'the update agent answered no JSON')
    }
  }

  return {
    async status() {
      const answer = await call('/status')
      const parsed = agentStatusSchema.safeParse(answer)

      if (!parsed.success) {
        throw new UpdateAgentError('update_agent_bad_response', 'the answer does not match')
      }

      return parsed.data
    },

    async run() {
      const answer = await call('/run', { method: 'POST' })
      const parsed = agentRunSchema.safeParse((answer as { run?: unknown } | null)?.run)

      if (!parsed.success) {
        throw new UpdateAgentError('update_agent_bad_response', 'the answer does not match')
      }

      return parsed.data
    },

    async runs() {
      const answer = await call('/runs')
      const parsed = agentRunsSchema.safeParse(answer)

      if (!parsed.success) {
        throw new UpdateAgentError('update_agent_bad_response', 'the answer does not match')
      }

      return parsed.data.runs
    },
  }
}
