import { describe, expect, it } from 'vitest'

import { type AgentRun, UPDATE_ERROR_DETAIL_MAX_CHARS } from '@stoerdesk/shared'

import { type CommandResult, type CommandRunner, UpdateRunner } from '../update-runner.js'

interface RecordedCommand {
  command: string
  args: readonly string[]
  cwd?: string
  env?: Record<string, string>
}

function recorder(answers: Record<string, CommandResult> = {}): {
  calls: RecordedCommand[]
  runner: CommandRunner
} {
  const calls: RecordedCommand[] = []

  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args: [...args], cwd: options?.cwd, env: options?.env })

    const key = `${command} ${args[0] ?? ''}`

    return answers[key] ?? { code: 0, stdout: '', stderr: '' }
  }

  return { calls, runner }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((inner) => {
    resolve = inner
  })

  return { promise, resolve }
}

function createRunner(
  runCommand: CommandRunner,
  onRunFinished: (run: AgentRun) => void,
  restoreOwnership = false,
): UpdateRunner {
  return new UpdateRunner({
    checkoutPath: '/repo',
    projectDirectory: '/repo',
    composeFile: '/repo/docker-compose.yml',
    runCommand,
    restoreOwnership,
    onRunFinished,
  })
}

describe('update runner', () => {
  it('pulls, rebuilds and prunes in this order', async () => {
    const { calls, runner } = recorder()
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.status).toBe('SUCCESS')
    expect(run.steps.map((step) => step.step)).toEqual(['git', 'compose', 'prune'])
    expect(calls[0]).toMatchObject({
      command: 'git',
      args: ['-c', 'safe.directory=/repo', 'pull', '--ff-only'],
      cwd: '/repo',
    })
    expect(calls[0]?.env).toEqual({ GIT_TERMINAL_PROMPT: '0' })
    expect(calls[1]).toMatchObject({
      command: 'docker',
      args: [
        'compose',
        '--project-directory',
        '/repo',
        '-f',
        '/repo/docker-compose.yml',
        'up',
        '-d',
        '--build',
      ],
      cwd: '/repo',
    })
    expect(calls[2]).toMatchObject({ command: 'docker', args: ['image', 'prune', '-f'] })
  })

  it('refuses a second run while a run is active', async () => {
    const { runner } = recorder()
    const updates = createRunner(runner, () => undefined)

    const first = await updates.start()
    const second = await updates.start()

    expect('run' in first).toBe(true)
    expect(second).toEqual({ conflict: true })
  })

  it('fails the run and skips the other steps when the pull fails', async () => {
    const { calls, runner } = recorder({
      'git -c': { code: 1, stdout: '', stderr: 'conflict' },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.status).toBe('FAILED')
    expect(run.errorCode).toBe('update_git_failed')
    expect(run.steps.map((step) => step.status)).toEqual(['failed', 'skipped', 'skipped'])
    expect(calls.filter((call) => call.command === 'docker')).toHaveLength(0)
  })

  it('carries the output of the failing pull as the error detail', async () => {
    const { runner } = recorder({
      'git -c': {
        code: 1,
        stdout: 'Already up to date.',
        stderr:
          'hint: Updates were rejected because it was not possible to fast-forward.\nfatal: Not possible to fast-forward, aborting.\n',
      },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.errorDetail).toContain('not possible to fast-forward')
    expect(run.errorDetail).not.toContain('Already up to date.')
  })

  it('falls back to the standard output when the failing step is silent', async () => {
    const { runner } = recorder({
      'docker image': { code: 1, stdout: 'a image is in use by container', stderr: '   \n' },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.errorCode).toBe('update_prune_failed')
    expect(run.errorDetail).toBe('a image is in use by container')
  })

  it('keeps a credential out of the error detail', async () => {
    const { runner } = recorder({
      'git -c': {
        code: 128,
        stdout: '',
        stderr:
          'fatal: Authentication failed for ' +
          "'https://ghp_Sup3rSecretTokenValue@github.com/icem0/StoerDesk/'\n",
      },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.errorDetail).toContain('Authentication failed')
    expect(run.errorDetail).not.toContain('Sup3rSecretTokenValue')
    expect(run.errorDetail).toContain('https://***@github.com')
  })

  it('never carries more than the bounded tail of a failing build', async () => {
    const noise = 'ERROR: build step failed\n'.repeat(500)
    const { runner } = recorder({
      'docker compose': { code: 1, stdout: '', stderr: noise },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect((run.errorDetail ?? '').length).toBeLessThanOrEqual(UPDATE_ERROR_DETAIL_MAX_CHARS)
    expect(run.errorDetail?.endsWith('build step failed')).toBe(true)
  })

  it('reports a partial run when the rebuild fails', async () => {
    const { runner } = recorder({
      'docker compose': { code: 1, stdout: '', stderr: 'build failed' },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.status).toBe('PARTIAL')
    expect(run.errorCode).toBe('update_compose_failed')
    expect(run.steps.map((step) => step.status)).toEqual(['ok', 'failed', 'skipped'])
  })

  it('reports a partial run when the prune fails', async () => {
    const { runner } = recorder({
      'docker image': { code: 1, stdout: '', stderr: 'busy' },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run))

    await updates.start()
    const run = await done.promise

    expect(run.status).toBe('PARTIAL')
    expect(run.errorCode).toBe('update_prune_failed')
    expect(run.steps.map((step) => step.status)).toEqual(['ok', 'ok', 'failed'])
  })

  it('restores the owner of the checkout after the pull', async () => {
    const { calls, runner } = recorder({
      'stat -c': { code: 0, stdout: '1000:1000\n', stderr: '' },
    })
    const done = deferred<AgentRun>()
    const updates = createRunner(runner, (run) => done.resolve(run), true)

    await updates.start()
    await done.promise

    const chown = calls.find((call) => call.command === 'chown')

    expect(chown?.args).toEqual(['-R', '1000:1000', '/repo'])
    expect(calls.findIndex((call) => call.command === 'git')).toBeLessThan(
      calls.findIndex((call) => call.command === 'chown'),
    )
  })

  it('reads the commit of the checkout', async () => {
    const { runner } = recorder({
      'git rev-parse': { code: 0, stdout: 'abc1234\n', stderr: '' },
    })
    const updates = createRunner(runner, () => undefined)

    const checkout = await updates.checkout()

    expect(checkout.commit).toBe('abc1234')
  })
})
