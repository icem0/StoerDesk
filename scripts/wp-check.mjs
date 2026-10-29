#!/usr/bin/env node
// Validates work packages written for small coding models.
//
//   npm run wp:check
//
// Legacy work packages without `format: small-model` are reported and skipped.
// New work packages must stay inside the context and file limits from PLAN.md.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wpRoot = join(repoRoot, 'work-packages')

const requiredKeys = [
  'depends-on',
  'phase',
  'context-budget',
  'spec',
  'files-read',
  'files-write',
  'interfaces',
]
const requiredSections = ['## Task', '## Non-goals', '## Acceptance', '## Handoff']

function markdownFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      files.push(...markdownFiles(path))
    } else if (entry.endsWith('.md') && entry !== 'README.md') {
      files.push(path)
    }
  }

  return files
}

function value(content, key) {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(content)
  return match === null ? null : match[1].trim()
}

function list(content, key) {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => line.trim() === `${key}:`)

  if (start === -1) {
    return null
  }

  const items = []

  for (const line of lines.slice(start + 1)) {
    if (/^[a-z][a-z0-9-]*:/.test(line) || /^##\s/.test(line)) {
      break
    }

    const item = /^\s*-\s+(.+)$/.exec(line)

    if (item !== null) {
      items.push(item[1].trim())
    }
  }

  return items
}

function checkFile(path) {
  const content = readFileSync(path, 'utf8')
  const name = relative(repoRoot, path)
  const errors = []

  if (value(content, 'format') !== 'small-model') {
    return { name, errors, skipped: true }
  }

  const lineCount = content.split('\n').length

  if (lineCount > 120) {
    errors.push(`document has ${lineCount} lines (max 120)`)
  }

  for (const key of requiredKeys) {
    const found = value(content, key) !== null || list(content, key) !== null

    if (!found) {
      errors.push(`missing metadata: ${key}`)
    }
  }

  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`missing section: ${section}`)
    }
  }

  const read = list(content, 'files-read') ?? []
  const write = list(content, 'files-write') ?? []
  const interfaces = list(content, 'interfaces') ?? []

  if (read.length === 0) {
    errors.push('files-read needs at least one entry')
  } else if (read.length > 6) {
    errors.push(`files-read has ${read.length} entries (max 6)`)
  }

  if (write.length === 0) {
    errors.push('files-write needs at least one entry')
  } else if (write.length > 4) {
    errors.push(`files-write has ${write.length} entries (max 4)`)
  }

  if (interfaces.length === 0) {
    errors.push('interfaces needs at least one entry')
  }

  const budget = /(\d+)\s*k/i.exec(value(content, 'context-budget') ?? '')

  if (budget === null) {
    errors.push('context-budget must contain a value such as "18k tokens"')
  } else if (Number(budget[1]) > 30) {
    errors.push(`context-budget is ${budget[1]}k (hard limit 30k)`)
  }

  const specLines = Number(value(content, 'spec-lines') ?? '0')

  if (Number.isFinite(specLines) && specLines > 200) {
    errors.push(`spec-lines is ${specLines} (max 200)`)
  }

  return { name, errors, skipped: false }
}

const files = markdownFiles(wpRoot).sort()
const results = files.map(checkFile)
const checked = results.filter((result) => !result.skipped)
const skipped = results.filter((result) => result.skipped)
const failed = checked.filter((result) => result.errors.length > 0)

for (const result of skipped) {
  console.log(`warn  ${result.name}: legacy WP without "format: small-model" (skipped)`)
}

for (const result of failed) {
  console.error(`fail  ${result.name}`)

  for (const error of result.errors) {
    console.error(`      - ${error}`)
  }
}

console.log(
  `wp-check: ${checked.length} small-model WP checked, ${failed.length} failed, ${skipped.length} legacy skipped`,
)

if (failed.length > 0) {
  process.exit(1)
}
