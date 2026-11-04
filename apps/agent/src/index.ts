import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { agentRunSchema, type AgentRun } from '@stoerdesk/shared'

import { loadAgentConfig } from './config.js'
import { createAgentServer } from './server.js'
import { resolveAgentToken } from './token.js'
import { type CommandRunner, UpdateRunner } from './update-runner.js'

/**
 * The entry point of the update agent (`specs/18-self-update.md` §18.4,
 * ADR-0006). The agent listens on the internal network only, needs the bearer
 * `UPDATE_AGENT_TOKEN` and runs the host update in the background.
 */

/** Runs a command without a shell and answers its exit code. */
export function createCommandRunner(): CommandRunner {
  return (command, args, options) =>
    new Promise((resolve) => {
      const child = spawn(command, [...args], {
        cwd: options?.cwd,
        env: { ...process.env, ...options?.env },
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', () => {
        resolve({ code: 1, stdout, stderr })
      })
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr })
      })
    })
}

/** Reads the last run of the state file, e.g. after a restart of the agent. */
export async function readState(stateDir: string): Promise<AgentRun | null> {
  try {
    const content = await readFile(join(stateDir, 'last-run.json'), 'utf8')
    const parsed = agentRunSchema.safeParse(JSON.parse(content))

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Writes the last run of the agent, so a restart does not lose it. */
export async function writeState(stateDir: string, run: AgentRun): Promise<void> {
  await mkdir(stateDir, { recursive: true })
  await writeFile(join(stateDir, 'last-run.json'), JSON.stringify(run), 'utf8')
}

async function main(): Promise<void> {
  const config = loadAgentConfig()
  const token = await resolveAgentToken(config)
  let lastRun = await readState(config.stateDir)

  const runner = new UpdateRunner({
    checkoutPath: config.checkoutPath,
    projectDirectory: config.projectDirectory,
    composeFile: config.composeFile,
    composeProject: config.composeProject,
    stepTimeoutMs: config.stepTimeoutMs,
    runCommand: createCommandRunner(),
    onRunFinished: (run) => {
      lastRun = run

      return writeState(config.stateDir, run)
    },
  })

  const server = createAgentServer({
    runner,
    token,
    getLastRun: () => lastRun,
  })

  server.listen(config.port, () => {
    process.stdout.write(`update agent listening on port ${config.port}\n`)
  })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error'

  process.stderr.write(`update agent failed to start: ${message}\n`)
  process.exitCode = 1
})
