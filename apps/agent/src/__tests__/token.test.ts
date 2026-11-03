import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type AgentConfig, loadAgentConfig } from '../config.js'
import { readTokenFile, resolveAgentToken, writeTokenFile } from '../token.js'

const directories: string[] = []

async function stateDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'stoerdesk-agent-'))

  directories.push(directory)

  return directory
}

function config(token: string, tokenFile: string): AgentConfig {
  return loadAgentConfig({ UPDATE_AGENT_TOKEN: token, UPDATE_AGENT_TOKEN_FILE: tokenFile })
}

afterEach(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true })
  }

  directories.length = 0
})

describe('the token of the agent', () => {
  it('uses the token of the environment', async () => {
    const directory = await stateDir()
    const token = await resolveAgentToken(config('from-the-environment', join(directory, 'token')))

    expect(token).toBe('from-the-environment')
  })

  it('uses the token of the state volume', async () => {
    const directory = await stateDir()
    const tokenFile = join(directory, 'agent-token')

    await writeTokenFile(tokenFile, 'from-the-volume')

    const token = await resolveAgentToken(config('', tokenFile))

    expect(token).toBe('from-the-volume')
  })

  it('creates a token and keeps it across restarts', async () => {
    const directory = await stateDir()
    const tokenFile = join(directory, 'agent-token')

    const created = await resolveAgentToken(config('', tokenFile))

    expect(created).toHaveLength(43)
    expect(await readTokenFile(tokenFile)).toBe(created)

    const second = await resolveAgentToken(config('', tokenFile))

    expect(second).toBe(created)
  })

  it('writes the token readable for the API container', async () => {
    const directory = await stateDir()
    const tokenFile = join(directory, 'agent-token')

    await resolveAgentToken(config('', tokenFile))

    const content = await readFile(tokenFile, 'utf8')

    expect(content.trim()).not.toBe('')
    expect(content.endsWith('\n')).toBe(true)
  })
})
