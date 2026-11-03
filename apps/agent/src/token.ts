import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AgentConfig } from './config.js'

/**
 * The bearer of the agent (`specs/18-self-update.md` §18.5, ADR-0006).
 *
 * The environment wins. Without a token in the environment the agent uses the
 * token of its state volume and creates one when it is missing — the API mounts
 * the same volume read-only and reads the value there, so the operator has to
 * configure nothing. The value stays the same across restarts, so the API keeps
 * talking to the same agent.
 */

/** Reads the token of the agent from its state volume. */
export async function readTokenFile(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, 'utf8')
    const token = content.trim()

    return token === '' ? null : token
  } catch {
    return null
  }
}

/**
 * Writes the token of the agent into its state volume. The file is readable by
 * the API container, which runs as `node`.
 */
export async function writeTokenFile(path: string, token: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${token}\n`, { encoding: 'utf8', mode: 0o644 })
}

/** The bearer the agent uses: the environment, the volume or a new one. */
export async function resolveAgentToken(config: AgentConfig): Promise<string> {
  const fromEnv = config.token.trim()

  if (fromEnv !== '') {
    return fromEnv
  }

  const existing = await readTokenFile(config.tokenFile)

  if (existing !== null) {
    return existing
  }

  const token = randomBytes(32).toString('base64url')

  await writeTokenFile(config.tokenFile, token)

  return token
}
