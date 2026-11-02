#!/usr/bin/env node
// Writes the next development version into the tracked `VERSION` file and stages it.
//
//   node scripts/version-file.mjs
//
// `.husky/pre-commit` runs this after lint. The post-commit hook tags exactly this
// value, so the version is part of the commit and survives an image build without
// `.git` (Docker, deployment panels). Do not edit `VERSION` by hand.

import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const versionPath = join(repoRoot, 'VERSION')
const gitDir = resolve(repoRoot, git(['rev-parse', '--git-dir']))

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/** Rebases rewrite history and must not create new per-commit versions. */
function isHistoryRewrite() {
  return (
    existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))
  )
}

function latestVersion() {
  const tags = git(['tag', '--list', 'v[0-9]*', '--sort=-version:refname'])
    .split('\n')
    .filter((tag) => /^v\d+\.\d+\.\d+/.test(tag))

  return tags[0] ?? null
}

function nextVersion(latest) {
  if (latest === null) {
    return 'v0.0.1'
  }

  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(latest)

  if (match === null) {
    throw new Error(`cannot derive the next version from tag '${latest}'`)
  }

  return `v${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function main() {
  if (isHistoryRewrite()) {
    return
  }

  const version = nextVersion(latestVersion())

  writeFileSync(versionPath, `${version}\n`)
  git(['add', 'VERSION'])
  console.log(`VERSION=${version}`)
}

main()
