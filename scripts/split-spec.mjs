#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const repoRoot = process.cwd()
const sourcePath = join(repoRoot, 'docs/material/PFLICHTENHEFT.md')
const specsDir = join(repoRoot, 'specs')

const mapping = [
  { file: '00-conventions.md', chapters: [0, 2] },
  { file: '01-rbac.md', chapters: [3] },
  { file: '02-data-model.md', chapters: [4] },
  { file: '03-ticket-workflow.md', chapters: [5] },
  { file: '04-oncall.md', chapters: [5.1] },
  { file: '05-timeline.md', chapters: [6] },
  { file: '06-report-form.md', chapters: [7] },
  { file: '07-escalation.md', chapters: [8] },
  { file: '08-objects-api.md', chapters: [9] },
  { file: '09-offline.md', chapters: [10] },
  { file: '10-notifications.md', chapters: [11] },
  { file: '11-dashboard.md', chapters: [12] },
  { file: '12-stats.md', chapters: [13] },
  { file: '13-ui.md', chapters: [14] },
  { file: '14-nfr.md', chapters: [15] },
  { file: '15-work-packages.md', chapters: [17] },
  { file: '16-acceptance.md', chapters: [18, 19] },
]

function chapterNumber(heading) {
  const match = heading.match(/(?:kapitel|chapter)\s*(\d+(?:\.\d+)?)/i)
  return match ? match[1] : null
}

function splitChapters(markdown) {
  const lines = markdown.split('\n')
  const chapters = new Map()
  let current = null
  let buffer = []

  const flush = () => {
    if (current !== null) {
      chapters.set(current, buffer.join('\n').trim())
    }
  }

  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line)
    const number = isHeading ? chapterNumber(line) : null

    if (number !== null) {
      flush()
      current = number
      buffer = [line]
      continue
    }

    if (current !== null) {
      buffer.push(line)
    }
  }

  flush()

  return chapters
}

if (!existsSync(sourcePath)) {
  console.log(`Keine Quelle gefunden: ${sourcePath} — nichts zu splitten.`)
  process.exit(0)
}

const markdown = readFileSync(sourcePath, 'utf8')
const chapters = splitChapters(markdown)

mkdirSync(specsDir, { recursive: true })

let written = 0

for (const entry of mapping) {
  const parts = entry.chapters
    .map((chapter) => chapters.get(String(chapter)))
    .filter((part) => part !== undefined)

  if (parts.length === 0) {
    continue
  }

  const target = join(specsDir, entry.file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${parts.join('\n\n')}\n`, 'utf8')
  written += 1
}

console.log(`split-spec: ${written} Spec-Dateien aus ${sourcePath} aktualisiert.`)
