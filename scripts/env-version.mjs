#!/usr/bin/env node
// Refreshes only `VITE_APP_VERSION` in the existing `.env` with the current git tag.
//
//   npm run env:version
//
// This is the refresh step after a checkout or pull: the Docker web build has no git
// metadata, so Compose reads the version from `.env`. Secrets are never printed.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetPath = join(repoRoot, '.env')

function currentVersion() {
  return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim()
}

function main() {
  if (!existsSync(targetPath)) {
    console.error('.env does not exist — run "npm run env:create" first')
    process.exit(1)
  }

  const version = currentVersion()
  const content = readFileSync(targetPath, 'utf8')
  const line = `VITE_APP_VERSION=${version}`
  const updated = /^VITE_APP_VERSION=/m.test(content)
    ? content.replace(/^VITE_APP_VERSION=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`

  if (updated === content) {
    console.log(`.env already carries VITE_APP_VERSION=${version}`)

    return
  }

  writeFileSync(targetPath, updated, { mode: 0o600 })
  console.log(`.env: VITE_APP_VERSION=${version}`)
}

main()
