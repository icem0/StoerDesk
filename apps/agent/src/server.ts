import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { agentStatusSchema, type AgentRun } from '@stoerdesk/shared'

import type { UpdateRunner } from './update-runner.js'

/**
 * The protocol of the update agent (`specs/18-self-update.md` §18.6). The
 * server speaks three paths, needs the bearer `UPDATE_AGENT_TOKEN` and answers
 * nothing else — no shell, no path and no argument from a request.
 */

export interface AgentServerOptions {
  /** The runner of the host update. */
  runner: UpdateRunner
  /** The bearer token of the agent. */
  token: string
  /** The last run the agent knows — it also comes from the state file. */
  getLastRun: () => AgentRun | null
}

/** Compares the tokens in constant time, without a length leak. */
export function tokenMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) {
    return false
  }

  const expectedDigest = createHash('sha256').update(expected).digest()
  const providedDigest = createHash('sha256').update(provided).digest()

  return timingSafeEqual(expectedDigest, providedDigest)
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)

  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function bearerOf(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization

  if (header === undefined || !header.startsWith('Bearer ')) {
    return undefined
  }

  return header.slice('Bearer '.length)
}

/** The state of the agent: a run in progress, the last run failed or idle. */
function stateOf(runner: UpdateRunner, lastRun: AgentRun | null): 'idle' | 'running' | 'failed' {
  if (runner.state === 'running') {
    return 'running'
  }

  if (lastRun?.status === 'FAILED') {
    return 'failed'
  }

  return 'idle'
}

/** Creates the HTTP server of the agent. */
export function createAgentServer(options: AgentServerOptions) {
  return createServer((request, response) => {
    void handle(request, response, options)
  })
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: AgentServerOptions,
): Promise<void> {
  if (!tokenMatches(options.token, bearerOf(request))) {
    send(response, 401, { code: 'unauthorized' })

    return
  }

  const path = new URL(request.url ?? '/', 'http://update-agent').pathname

  if (request.method === 'GET' && path === '/status') {
    const lastRun = options.getLastRun()
    const status = agentStatusSchema.parse({
      state: stateOf(options.runner, lastRun),
      checkout: await options.runner.checkout(),
      lastRun,
    })

    send(response, 200, status)

    return
  }

  if (request.method === 'POST' && path === '/run') {
    const started = await options.runner.start()

    if ('conflict' in started) {
      send(response, 409, { code: 'update_already_running' })

      return
    }

    send(response, 202, { run: started.run })

    return
  }

  if (request.method === 'GET' && path === '/runs') {
    const lastRun = options.getLastRun()

    send(response, 200, { runs: lastRun === null ? [] : [lastRun] })

    return
  }

  send(response, 404, { code: 'not_found' })
}
