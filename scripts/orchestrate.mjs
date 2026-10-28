#!/usr/bin/env node
import { spawn } from 'node:child_process'

const steps = [
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck', '--workspaces', '--if-present'] },
  { name: 'lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'test', command: 'npm', args: ['run', 'test:run'] },
  { name: 'i18n:check', command: 'npm', args: ['run', 'i18n:check'] },
]

function run(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, { stdio: 'inherit', shell: false })

    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

const results = []

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`)
  const code = await run(step)
  results.push({ name: step.name, code })
}

console.log('\n=== summary ===')

for (const result of results) {
  console.log(`${result.code === 0 ? 'OK  ' : 'FAIL'}  ${result.name}`)
}

const failed = results.filter((result) => result.code !== 0)

process.exit(failed.length === 0 ? 0 : 1)
