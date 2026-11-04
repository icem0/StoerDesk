#!/usr/bin/env node
// Host deploy hook of the update menu (specs/18-self-update.md §18.4, ADR-0007).
//
//   DEPLOY_HOOK_TOKEN=<same value as UPDATE_WEBHOOK_TOKEN> npm run deploy:hook
//
// Listens for POST <DEPLOY_HOOK_PATH> with the header X-Deploy-Token. A valid
// request answers 202 at once and starts `sh scripts/update.sh --yes` in the
// background; its output is appended to deploy-hook.log in the repository root.
// A request while a deployment runs answers 409. Only built-in modules.

import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { appendFileSync, openSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const token = process.env.DEPLOY_HOOK_TOKEN ?? ''
const port = Number(process.env.DEPLOY_HOOK_PORT ?? 9000)
const host = process.env.DEPLOY_HOOK_HOST ?? '0.0.0.0'
const hookPath = process.env.DEPLOY_HOOK_PATH ?? '/hooks/deploy'
const logFile = join(root, 'deploy-hook.log')

if (token.length < 32) {
  console.error('DEPLOY_HOOK_TOKEN is missing or shorter than 32 characters')
  process.exit(1)
}

/** Timing-safe comparison: the token never leaks through the response time. */
function tokenMatches(provided) {
  const a = Buffer.from(provided)
  const b = Buffer.from(token)

  return a.length === b.length && timingSafeEqual(a, b)
}

let deployment = null

function startDeployment() {
  const output = openSync(logFile, 'a')
  const child = spawn('sh', ['scripts/update.sh', '--yes'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', output, output],
  })

  child.unref()
  appendFileSync(logFile, `${new Date().toISOString()} deployment started (pid ${child.pid})\n`)

  return child
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://hook')

  if (request.method !== 'POST' || url.pathname !== hookPath) {
    response.writeHead(404).end()

    return
  }

  const provided = request.headers['x-deploy-token']

  // The body is not used: the hook takes no parameter from the request.
  request.resume()

  if (typeof provided !== 'string' || !tokenMatches(provided)) {
    response.writeHead(401).end()

    return
  }

  if (deployment !== null && deployment.exitCode === null) {
    response.writeHead(409).end()

    return
  }

  deployment = startDeployment()
  response.writeHead(202, { 'content-type': 'application/json' }).end('{"started":true}')
})

server.listen(port, host, () => {
  console.log(`deploy hook listening on ${host}:${port}${hookPath}`)
})
