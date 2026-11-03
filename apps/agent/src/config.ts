import { z } from 'zod'

/**
 * The environment of the update agent (`specs/18-self-update.md` §18.5,
 * ADR-0006). The token is the only secret; it lives in `.env` and never in a
 * log line, never in an answer and never in the state file.
 */

export const agentConfigSchema = z.object({
  token: z.string().min(32, 'UPDATE_AGENT_TOKEN needs at least 32 characters'),
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
    port: env.UPDATE_AGENT_PORT,
    checkoutPath: env.UPDATE_AGENT_CHECKOUT,
    projectDirectory: env.UPDATE_AGENT_PROJECT_DIR,
    composeFile: env.UPDATE_AGENT_COMPOSE_FILE,
    stateDir: env.UPDATE_AGENT_STATE_DIR,
  })
}
