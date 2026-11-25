#!/usr/bin/env node
// Validates work packages written for coding models.
//
//   npm run wp:check
//
// Two profiles exist (PLAN.md §17):
//
//   format: ctx-128k — a 64k–128k context window; a narrow slice.
//   format: ctx-256k — a 256k context window; a vertical slice from the
//                      database to the user interface in one package.
//
// `format: small-model` is the former name of `ctx-128k` and stays valid, so
// the work packages written before stay checked. A work package without a
// known `format` is reported and skipped. New work packages must stay inside
// the limits of their profile.

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

// The limits of PLAN.md §17, one set per profile.
const narrow = {
  docLines: 120,
  writeFiles: 4,
  readFiles: 6,
  contextBudget: 30,
  specLines: 200,
  requiredKeys: [],
}
const vertical = {
  docLines: 200,
  writeFiles: 10,
  readFiles: 12,
  contextBudget: 100,
  specLines: 600,
  requiredKeys: ['changed-lines'],
}

const profiles = {
  'ctx-128k': narrow,
  'small-model': narrow,
  'ctx-256k': vertical,
}

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

/**
 * A test or a fixture does not count as a source file (PLAN.md §17: "max. 10
 * changed source files (tests and fixtures excluded)"). The work packages
 * name their test directories as `__tests__` or, in the markdown of the
 * packages, as `**tests**`.
 */
function isTestPath(path) {
  return (
    path.includes('__tests__') ||
    path.includes('**tests**') ||
    path.includes('/tests/') ||
    /\.(test|spec)\.[a-z]+$/.test(path)
  )
}

function sourcePaths(paths) {
  return paths.filter((path) => !isTestPath(path))
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
  const format = value(content, 'format')

  if (format === null || profiles[format] === undefined) {
    return { name, errors, skipped: true, format }
  }

  const limits = profiles[format]
  const lineCount = content.split('\\n').length

  if (lineCount > limits.docLines) {
    errors.push(`document has ${lineCount} lines (max ${limits.docLines})`)
  }

  for (const key of [...requiredKeys, ...limits.requiredKeys]) {
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

  const readSources = sourcePaths(read)
  const writeSources = sourcePaths(write)

  if (read.length === 0) {
    errors.push('files-read needs at least one entry')
  } else if (readSources.length > limits.readFiles) {
    errors.push(`files-read has ${readSources.length} source files (max ${limits.readFiles})`)
  }

  if (write.length === 0) {
    errors.push('files-write needs at least one entry')
  } else if (writeSources.length > limits.writeFiles) {
    errors.push(`files-write has ${writeSources.length} source files (max ${limits.writeFiles})`)
  }

  if (interfaces.length === 0) {
    errors.push('interfaces needs at least one entry')
  }

  const budget = /(\d+)\s*k/i.exec(value(content, 'context-budget') ?? '')

  if (budget === null) {
    errors.push('context-budget must contain a value such as "18k tokens"')
  } else if (Number(budget[1]) > limits.contextBudget) {
    errors.push(`context-budget is ${budget[1]}k (hard limit ${limits.contextBudget}k)`)
  }

  const specLines = Number(value(content, 'spec-lines') ?? '0')

  if (Number.isFinite(specLines) && specLines > limits.specLines) {
    errors.push(`spec-lines is ${specLines} (max ${limits.specLines})`)
  }

  const changedLines = Number(value(content, 'changed-lines') ?? '0')

  if (limits.requiredKeys.includes('changed-lines')) {
    if (!Number.isFinite(changedLines) || changedLines <= 0) {
      errors.push('changed-lines must name the number of changed lines')
    } else if (changedLines > 800) {
      errors.push(`changed-lines is ${changedLines} (max 800)`)
    }
  }

  return { name, errors, skipped: false, format }
}

const files = markdownFiles(wpRoot).sort()
const results = files.map(checkFile)
const checked = results.filter((result) => !result.skipped)
const skipped = results.filter((result) => result.skipped)
const failed = checked.filter((result) => result.errors.length > 0)

for (const result of skipped) {
  console.log(`warn  ${result.name}: legacy WP without a known "format" (skipped)`)
}

for (const result of failed) {
  console.error(`fail  ${result.name}`)

  for (const error of result.errors) {
    console.error(`      - ${error}`)
  }
}

const counts = new Map()

for (const result of checked) {
  counts.set(result.format, (counts.get(result.format) ?? 0) + 1)
}

console.log(
  `wp-check: ${checked.length} WP checked (${[...counts]
    .map(([format, count]) => `${format} ${count}`)
    .join(', ')}), ${failed.length} failed, ${skipped.length} legacy skipped`,
)

if (failed.length > 0) {
  process.exit(1)
}
