#!/usr/bin/env node
// The gate of the repository (PLAN.md §18.1, WP-M28-03).
//
//   npm run check
//
// The gates run in the order of their weight: the four static gates — the
// typecheck, the lint, the i18n check and the check of the work packages —
// read the sources and nothing else, so they run beside each other. The tests
// and the E2E need the database and the ports of the machine, so they wait for
// the static gates and run one after the other.
//
// Every gate writes its own log; the first failure ends the run with the exit
// code of the gate, so a red gate is a red gate.
//
// The Husky hooks reuse exactly this gate, so a local check can never be weaker
// than CI (PLAN.md §18.1):
//
//   node scripts/check.mjs --static   only the static gates (pre-commit)
//   node scripts/check.mjs --no-e2e   everything but the browser E2E (pre-push)
//
// A red typecheck in CI means the same typecheck was never run locally; the
// hooks exist so that cannot happen silently any more.

import { spawn } from 'node:child_process'

const staticOnly = process.argv.includes('--static')
const withoutE2e = process.argv.includes('--no-e2e')

/** The static gates of the check — they run beside each other. */
const staticGates = [
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck', '--workspaces', '--if-present'] },
  { name: 'lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'i18n', command: 'npm', args: ['run', 'i18n:check'] },
  { name: 'wp', command: 'npm', args: ['run', 'wp:check'] },
]

/** The gates that need the machine alone. */
const sequentialGates = [
  { name: 'tests', command: 'npx', args: ['vitest', 'run'] },
  { name: 'e2e', command: 'npm', args: ['run', 'test:e2e'] },
]

function run(gate) {
  return new Promise((done) => {
    const child = spawn(gate.command, gate.args, { stdio: 'inherit', shell: false })

    child.on('close', (code) => {
      done({ name: gate.name, code: code ?? 1 })
    })
  })
}

async function main() {
  const results = await Promise.all(staticGates.map(run))
  const failed = results.find((result) => result.code !== 0)

  if (failed !== undefined) {
    process.stderr.write(`check: the gate "${failed.name}" failed\n`)

    return failed.code
  }

  if (staticOnly) {
    return 0
  }

  for (const gate of sequentialGates) {
    if (withoutE2e && gate.name === 'e2e') {
      continue
    }

    const result = await run(gate)

    if (result.code !== 0) {
      process.stderr.write(`check: the gate "${gate.name}" failed\n`)

      return result.code
    }
  }

  return 0
}

process.exitCode = await main()
