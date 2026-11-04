import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hostname as osHostname } from 'node:os'
import { join } from 'node:path'

import {
  type AgentRun,
  UPDATE_ERROR_DETAIL_MAX_CHARS,
  type UpdateAgentState,
  type UpdateErrorCode,
  type UpdateStep,
} from '@stoerdesk/shared'

/**
 * The host update of the update agent (`specs/18-self-update.md` §18.4, §18.7,
 * ADR-0006). The runner knows the three steps of a run — `git pull` →
 * `docker compose up -d --build` → the project-scoped image clean-up — and
 * nothing else: a request never carries a command, a path or an argument.
 *
 * The command runner is injected, so the whole logic is testable without a
 * shell and without a Docker daemon.
 */

/** The output of one command. A failed step contributes its tail to the run. */
export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

/** Runs one command and answers its exit code and its output. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string; env?: Record<string, string> },
) => Promise<CommandResult>

/** One command of a step: the program and its fixed argument list. */
export interface Command {
  command: string
  args: readonly string[]
}

export interface UpdateRunnerOptions {
  /** The checkout of the repository, inside the agent `/repo`. */
  checkoutPath: string
  /** The compose project directory — the checkout on the host. */
  projectDirectory: string
  /** The compose file of the project. */
  composeFile: string
  /**
   * The compose project the agent belongs to. Empty or absent means that the
   * agent reads the project from its own container label, so it redeploys the
   * stack it runs in — also when a panel started it with another project name.
   */
  composeProject?: string
  /** Runs a command. */
  runCommand: CommandRunner
  /**
   * The image names this deployment owns. Defaults to `OWN_IMAGES` — the
   * `image:` names of `docker-compose.yml`.
   */
  ownImages?: readonly string[]
  /** Restores the owner of the checkout after the pull (ADR-0006). */
  restoreOwnership?: boolean
  /** Called when a run has finished — the agent writes its state file. */
  onRunFinished?: (run: AgentRun) => void | Promise<void>
  /** The clock of the runs. */
  now?: () => Date
  /** The id of a run. */
  createRunId?: () => string
}

const STEP_ERROR_CODES: Record<UpdateStep, UpdateErrorCode> = {
  git: 'update_git_failed',
  compose: 'update_compose_failed',
  prune: 'update_prune_failed',
}

/** The source a panel build fetches when the project has no git checkout. */
export const DEFAULT_BUILD_CONTEXT = 'https://github.com/icem0/StoerDesk.git#main'

/**
 * The images this deployment owns — the three `image:` names of
 * `docker-compose.yml`, the same list `scripts/update.sh` cleans by
 * (WP-M3-02b).
 */
export const OWN_IMAGES: readonly string[] = [
  'stoerdesk-api:latest',
  'stoerdesk-web:latest',
  'stoerdesk-agent:latest',
]

const REDACTED = '***'

/**
 * The credential shapes a command output must never carry out of the agent
 * (§18.5): the userinfo of a remote URL, a known token format, an
 * `Authorization` value and a secret assignment.
 */
const CREDENTIAL_RULES: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s@/]+(?=@)/gi, replacement: `$1${REDACTED}` },
  {
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{6,}|github_pat_[A-Za-z0-9_]{6,}|xox[baprs]-[A-Za-z0-9-]{6,})\b/g,
    replacement: REDACTED,
  },
  { pattern: /(\bauthorization\s*[:=]\s*)(?:basic|bearer)?\s*\S+/gi, replacement: `$1${REDACTED}` },
  {
    pattern:
      /(\b(?:token|password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key)\b\s*[:=]\s*)\S+/gi,
    replacement: `$1${REDACTED}`,
  },
]

/** Removes every credential that a command could have echoed (§18.5). */
export function redactCredentials(text: string): string {
  let redacted = text

  for (const rule of CREDENTIAL_RULES) {
    redacted = redacted.replace(rule.pattern, rule.replacement)
  }

  return redacted
}

/** Drops the control characters of a terminal output; keeps `\n` and `\t`. */
function keepPrintable(text: string): string {
  let kept = ''

  for (const char of text) {
    const code = char.charCodeAt(0)

    if ((code >= 0x20 && code !== 0x7f) || char === '\n' || char === '\t') {
      kept += char
    }
  }

  return kept
}

/**
 * The output tail of a failed command: stderr first, stdout when stderr is
 * empty, without control characters, redacted and never longer than
 * `UPDATE_ERROR_DETAIL_MAX_CHARS`. `null` when the command said nothing — the
 * error code of the step still names what failed.
 */
export function failureDetail(result: CommandResult): string | null {
  const raw = result.stderr.trim() === '' ? result.stdout : result.stderr
  const text = keepPrintable(raw.replace(/\r\n?/g, '\n')).trim()

  if (text === '') {
    return null
  }

  // Redacted first, then cut: a tail that starts inside a credential would cut
  // the pattern apart and let the rest of the secret through.
  const redacted = redactCredentials(text)

  return redacted.length > UPDATE_ERROR_DETAIL_MAX_CHARS
    ? redacted.slice(-UPDATE_ERROR_DETAIL_MAX_CHARS)
    : redacted
}

/** The outcome of one step of a run. */
interface StepOutcome {
  ok: boolean
  detail: string | null
}

/**
 * One host update. The run happens in the background: the answer of the API is
 * sent before the rebuild starts, because the rebuild replaces the API
 * container and the request dies with it.
 */
export class UpdateRunner {
  private readonly checkoutPath: string
  private readonly projectDirectory: string
  private readonly composeFile: string
  private readonly composeProject: string
  private readonly runCommand: CommandRunner
  private readonly ownImages: readonly string[]
  private readonly restoreOwnership: boolean
  private readonly onRunFinished: ((run: AgentRun) => void | Promise<void>) | undefined
  private readonly now: () => Date
  private readonly createRunId: () => string
  private activeRun: AgentRun | null = null
  private lastRun: AgentRun | null = null

  constructor(options: UpdateRunnerOptions) {
    this.checkoutPath = options.checkoutPath
    this.projectDirectory = options.projectDirectory
    this.composeFile = options.composeFile
    this.composeProject = options.composeProject ?? ''
    this.runCommand = options.runCommand
    this.ownImages = options.ownImages ?? OWN_IMAGES
    this.restoreOwnership = options.restoreOwnership ?? true
    this.onRunFinished = options.onRunFinished
    this.now = options.now ?? (() => new Date())
    this.createRunId = options.createRunId ?? (() => randomUUID())
  }

  /** The state of the agent: idle, a run in progress or the last run failed. */
  get state(): UpdateAgentState {
    if (this.activeRun !== null) {
      return 'running'
    }

    if (this.lastRun?.status === 'FAILED') {
      return 'failed'
    }

    return 'idle'
  }

  /** The last run the agent knows — also the one it writes to its state file. */
  get lastRunRecord(): AgentRun | null {
    return this.lastRun
  }

  /** The version and the commit of the checkout. */
  async checkout(): Promise<{ version: string | null; commit: string | null }> {
    const version = await this.readVersion()
    const result = await this.runCommand('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: this.checkoutPath,
    })
    const commit = result.code === 0 ? result.stdout.trim() : null

    return { version, commit: commit === '' ? null : commit }
  }

  /**
   * Starts one run. A second run while a run is active is refused — the
   * rebuild of the stack must not overlap with itself.
   */
  async start(): Promise<{ run: AgentRun } | { conflict: true }> {
    if (this.activeRun !== null) {
      return { conflict: true }
    }

    const run: AgentRun = {
      id: this.createRunId(),
      status: 'RUNNING',
      startedAt: this.now().toISOString(),
      finishedAt: null,
      beforeVersion: await this.readVersion(),
      afterVersion: null,
      errorCode: null,
      errorDetail: null,
      steps: [],
    }

    this.activeRun = run
    this.lastRun = run

    void this.execute(run)

    return { run }
  }

  private async execute(run: AgentRun): Promise<void> {
    let step: UpdateStep = 'git'

    try {
      const project = await this.resolveComposeProject()
      const gitCheckout = await this.isGitCheckout()

      if (!gitCheckout) {
        // A panel such as Arcane syncs or builds the sources itself and leaves
        // no git checkout behind. There is nothing to pull; the compose build
        // is the update. Skipping beats failing the whole run.
        this.skip(run, 'git')
      } else {
        const owner = this.restoreOwnership ? await this.readOwner() : null

        const pulled = await this.step(
          run,
          step,
          'git',
          ['-c', `safe.directory=${this.checkoutPath}`, 'pull', '--ff-only', '--autostash'],
          {
            cwd: this.checkoutPath,
            env: { GIT_TERMINAL_PROMPT: '0' },
          },
        )

        if (owner !== null) {
          await this.restoreOwner(owner)
        }

        if (!pulled.ok) {
          this.skip(run, 'compose')
          this.skip(run, 'prune')
          await this.finish(run, 'FAILED', 'update_git_failed', pulled.detail)
          await this.onRunFinished?.(run)

          return
        }
      }

      // The image ids the owned names carry **before** the rebuild: the rebuild
      // moves the fixed `:latest` tags to the new images, and the image it
      // replaces is tagless afterwards, so no name filter finds it any more.
      const ownedBefore = await this.imageIds(this.ownImages.map((name) => `reference=${name}`))

      step = 'compose'

      const composed = await this.step(
        run,
        step,
        'docker',
        await this.composeArgs(project),
        // The compose client reads the `.env` of the project from its working
        // directory — the checkout of the host.
        { cwd: this.projectDirectory, env: await this.buildEnv(gitCheckout) },
      )

      if (!composed.ok) {
        this.skip(run, 'prune')
        await this.finish(run, 'PARTIAL', 'update_compose_failed', composed.detail)
      } else {
        step = 'prune'

        const pruned = await this.pruneStep(run, project, ownedBefore)

        await this.finish(
          run,
          pruned.ok ? 'SUCCESS' : 'PARTIAL',
          pruned.ok ? null : 'update_prune_failed',
          pruned.detail,
        )
      }
    } catch {
      await this.finish(run, 'FAILED', STEP_ERROR_CODES[step], null)
    }

    await this.onRunFinished?.(run)
  }

  /**
   * The compose project of the running stack. A deployment panel may start the
   * stack under its own project name; redeploying with the file name instead
   * would create a second stack next to the running one. The label of the own
   * container is the reliable source.
   */
  private async resolveComposeProject(): Promise<string | null> {
    if (this.composeProject !== '') {
      return this.composeProject
    }

    const hostname = process.env.HOSTNAME ?? osHostname()

    if (hostname === '') {
      return null
    }

    const result = await this.runCommand('docker', [
      'inspect',
      '--type',
      'container',
      '--format',
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      hostname,
    ])

    if (result.code !== 0) {
      return null
    }

    const project = result.stdout.trim()

    return project === '' || project === '<no value>' ? null : project
  }

  /** Whether the checkout is a git work tree (a panel sync may leave none). */
  private async isGitCheckout(): Promise<boolean> {
    const result = await this.runCommand(
      'git',
      ['-c', `safe.directory=${this.checkoutPath}`, 'rev-parse', '--is-inside-work-tree'],
      { cwd: this.checkoutPath, env: { GIT_TERMINAL_PROMPT: '0' } },
    )

    return result.code === 0 && result.stdout.trim() === 'true'
  }

  /**
   * The build context of a checkout without git metadata. A panel may keep only
   * a synced copy of the files; building that copy would redeploy the old
   * sources. The Git URL makes the compose build fetch the current sources,
   * unless the operator configured another Git URL in the `.env`.
   */
  private async buildEnv(gitCheckout: boolean): Promise<Record<string, string> | undefined> {
    if (gitCheckout) {
      return undefined
    }

    const configured = await this.dotEnvValue('IMAGE_BUILD_CONTEXT')

    if (configured !== null && /^(?:https?|git|ssh):\/\//i.test(configured)) {
      return undefined
    }

    return { IMAGE_BUILD_CONTEXT: DEFAULT_BUILD_CONTEXT }
  }

  /** One value of the project `.env`, without quotes; `null` when absent. */
  private async dotEnvValue(name: string): Promise<string | null> {
    try {
      const content = await readFile(join(this.projectDirectory, '.env'), 'utf8')
      const match = new RegExp(`^${name}=(.*)$`, 'm').exec(content)

      if (match === null) {
        return null
      }

      return match[1]?.trim().replace(/^(['"])(.*)\1$/, '$2') ?? ''
    } catch {
      return null
    }
  }

  /**
   * The compose command of the redeploy. Optional profiles that are running
   * now (e.g. `backup`) are kept, so the update covers every running container
   * of the stack. The profile `update` is never enabled: it contains the agent
   * itself, which must survive the redeploy it triggers.
   */
  private async composeArgs(project: string | null): Promise<string[]> {
    const args = ['compose']

    if (project !== null) {
      args.push('-p', project)
    }

    if (project !== null) {
      const services = await this.runningServices(project)

      if (services.includes('backup')) {
        args.push('--profile', 'backup')
      }
    }

    args.push(
      '--project-directory',
      this.projectDirectory,
      '-f',
      this.composeFile,
      'up',
      '-d',
      '--build',
    )

    return args
  }

  /** The services of the project that currently run on the host. */
  private async runningServices(project: string): Promise<string[]> {
    const result = await this.runCommand('docker', [
      'ps',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Label "com.docker.compose.service"}}',
    ])

    if (result.code !== 0) {
      return []
    }

    return result.stdout
      .split('\n')
      .map((service) => service.trim())
      .filter((service) => service !== '')
  }

  /**
   * The clean-up of the images this update replaced (WP-M3-02b, the agent path
   * of §18.7 — the same rule `scripts/update.sh` applies).
   *
   * `docker compose up -d --build` moves the fixed `:latest` tags of the stack
   * to the new images, so the previous image of every built service turns
   * tagless. A project-labelled `docker image prune -f` only finds such an image
   * when the **build** wrote the project label into it — never for a build from
   * a remote context, a `docker-compose` v1 fallback or an aborted build. So the
   * images are cleaned by **id**: the ids every owned name had before the
   * rebuild, minus the current image of each owned name and the images of the
   * running containers of this project.
   *
   * The labelled prune stays as the last, best-effort command: it also sweeps
   * the project-prefixed default names of an older layout, which carry the image
   * label. An unscoped prune is never run, so the images of other projects stay
   * untouched. The owned names of `docker-compose.yml` carry no project prefix —
   * the same simplification `scripts/update.sh` documents: a shared host must
   * not run two StörDesk projects with these image names.
   */
  private async pruneCommands(
    project: string | null,
    ownedBefore: readonly string[],
  ): Promise<Command[]> {
    const owned = [...this.ownImages]
    const keep = new Set(await this.keptImageIds(project, owned))
    const stale = [...new Set(ownedBefore)].filter((id) => id !== '' && !keep.has(id))

    const commands: Command[] = []

    for (const id of stale) {
      commands.push({ command: 'docker', args: ['rmi', id] })
    }

    if (project !== null) {
      commands.push({
        command: 'docker',
        args: ['image', 'prune', '-f', '--filter', `label=com.docker.compose.project=${project}`],
      })
    }

    return commands
  }

  /** The images the clean-up must keep. */
  private async keptImageIds(project: string | null, owned: string[]): Promise<string[]> {
    const current = await this.imageIds(owned.map((name) => `reference=${name}`))

    if (project === null) {
      return current
    }

    return [...current, ...(await this.runningImageIds(project))]
  }

  /** The image ids of the images matching every `--filter` term. */
  private async imageIds(filters: string[]): Promise<string[]> {
    if (filters.length === 0) {
      return []
    }

    const args = ['image', 'ls', '--no-trunc', '-q']

    for (const filter of filters) {
      args.push('--filter', filter)
    }

    const result = await this.runCommand('docker', args)

    if (result.code !== 0) {
      return []
    }

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  }

  /** The image ids the running containers of the project hold. */
  private async runningImageIds(project: string): Promise<string[]> {
    const result = await this.runCommand('docker', [
      'ps',
      '--all',
      '--no-trunc',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Image}}',
    ])

    if (result.code !== 0) {
      return []
    }

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  }

  /**
   * The `prune` step: every command of the clean-up runs one after the other.
   * The step is `ok` when at least one command succeeded or there was nothing to
   * remove — a `docker rmi` of an image a container still holds fails and is a
   * kept image, not a failed update (§18.7).
   */
  private async pruneStep(
    run: AgentRun,
    project: string | null,
    ownedBefore: readonly string[],
  ): Promise<StepOutcome> {
    const commands = await this.pruneCommands(project, ownedBefore)

    if (commands.length === 0) {
      run.steps.push({ step: 'prune', status: 'ok', errorCode: null })

      return { ok: true, detail: null }
    }

    let succeeded = false
    let failure: string | null = null

    for (const command of commands) {
      const result = await this.runCommand(command.command, command.args)

      if (result.code === 0) {
        succeeded = true
      } else {
        failure = failureDetail(result) ?? failure
      }
    }

    run.steps.push({
      step: 'prune',
      status: succeeded ? 'ok' : 'failed',
      errorCode: succeeded ? null : STEP_ERROR_CODES.prune,
    })

    return { ok: succeeded, detail: succeeded ? null : failure }
  }

  private async step(
    run: AgentRun,
    step: UpdateStep,
    command: string,
    args: readonly string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): Promise<StepOutcome> {
    const result = await this.runCommand(command, args, options)
    const ok = result.code === 0

    run.steps.push({
      step,
      status: ok ? 'ok' : 'failed',
      errorCode: ok ? null : STEP_ERROR_CODES[step],
    })

    return { ok, detail: ok ? null : failureDetail(result) }
  }

  private skip(run: AgentRun, step: UpdateStep): void {
    run.steps.push({ step, status: 'skipped', errorCode: null })
  }

  private async finish(
    run: AgentRun,
    status: AgentRun['status'],
    errorCode: UpdateErrorCode | null,
    errorDetail: string | null,
  ): Promise<void> {
    run.status = status
    run.errorCode = errorCode
    run.errorDetail = status === 'SUCCESS' ? null : errorDetail
    run.afterVersion = await this.readVersion()
    run.finishedAt = this.now().toISOString()
    this.activeRun = null
  }

  private async readVersion(): Promise<string | null> {
    try {
      const content = await readFile(join(this.checkoutPath, 'VERSION'), 'utf8')
      const version = content.trim()

      return version === '' ? null : version
    } catch {
      return null
    }
  }

  /** The owner of the checkout, so the pull cannot change it (ADR-0006). */
  private async readOwner(): Promise<string | null> {
    const result = await this.runCommand('stat', ['-c', '%u:%g', this.checkoutPath])

    if (result.code !== 0) {
      return null
    }

    const owner = result.stdout.trim()

    return owner === '' ? null : owner
  }

  private async restoreOwner(owner: string): Promise<void> {
    await this.runCommand('chown', ['-R', owner, this.checkoutPath])
  }
}
