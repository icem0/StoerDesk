import { z } from 'zod'

/**
 * The environment of the update agent (`specs/18-self-update.md` §18.5,
 * ADR-0006). The token is the only secret; it lives in `.env` and never in a
 * log line, never in an answer and never in the state file.
 */

export const agentConfigSchema = z.object({
  /**
   * The bearer of the agent. Empty means that the agent generates its own
   * token and writes it into the state volume, so the API can read the same
   * value there — the operator configures nothing.
   */
  token: z.string().default(''),
  /** The file of the token inside the state volume. */
  tokenFile: z.string().min(1).default('/state/agent-token'),
  port: z.coerce.number().int().min(1).max(65535).default(8080),
  checkoutPath: z.string().min(1).default('/repo'),
  projectDirectory: z.string().min(1).default('/repo'),
  composeFile: z.string().min(1).default('/repo/docker-compose.yml'),
  stateDir: z.string().min(1).default('/state'),
})

export type AgentConfig = z.infer<typeof agentConfigSchema>

/** Reads the environment of the agent. */
export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return agentConfigSchema.parse({
    token: env.UPDATE_AGENT_TOKEN,
    tokenFile: env.UPDATE_AGENT_TOKEN_FILE,
    port: env.UPDATE_AGENT_PORT,
    checkoutPath: env.UPDATE_AGENT_CHECKOUT,
    projectDirectory: env.UPDATE_AGENT_PROJECT_DIR,
    composeFile: env.UPDATE_AGENT_COMPOSE_FILE,
    stateDir: env.UPDATE_AGENT_STATE_DIR,
  })
}
