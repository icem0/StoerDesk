import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = process.cwd()
const webLocalesDir = join(repoRoot, 'apps/web/src/i18n/locales')
const sharedI18nDir = join(repoRoot, 'packages/shared/src/i18n')

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonValue
}

function flatten(value: JsonValue, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  )
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile())
    .sort()
}

function collectWebKeys(locale: string): Map<string, string> {
  const keys = new Map<string, string>()

  for (const file of listJsonFiles(join(webLocalesDir, locale))) {
    const namespace = file.split('/').pop()?.replace('.json', '') ?? ''
    for (const key of flatten(readJson(file))) {
      keys.set(`${namespace}:${key}`, relative(repoRoot, file))
    }
  }

  return keys
}

function collectSharedKeys(locale: string): Map<string, string> {
  const keys = new Map<string, string>()
  const suffixes = ['server', 'seed']

  for (const suffix of suffixes) {
    const file = join(sharedI18nDir, `${suffix}.${locale}.json`)
    if (!existsSync(file)) {
      continue
    }
    for (const key of flatten(readJson(file))) {
      keys.set(`${suffix}:${key}`, relative(repoRoot, file))
    }
  }

  return keys
}

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  const entries: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      entries.push(...listSourceFiles(path))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      entries.push(path)
    }
  }

  return entries
}

function collectReferencedKeys(): string[] {
  const pattern = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g
  const referenced = new Set<string>()

  for (const file of listSourceFiles(join(repoRoot, 'apps/web/src'))) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(pattern)) {
      const key = match[1]
      if (key) {
        referenced.add(key)
      }
    }
  }

  return [...referenced]
}

const problems: string[] = []

const [deWeb, enWeb] = [collectWebKeys('de'), collectWebKeys('en')]

for (const key of deWeb.keys()) {
  if (!enWeb.has(key)) {
    problems.push(`fehlt in en: ${key} (${deWeb.get(key)})`)
  }
}

for (const key of enWeb.keys()) {
  if (!deWeb.has(key)) {
    problems.push(`fehlt in de: ${key} (${enWeb.get(key)})`)
  }
}

const [deShared, enShared] = [collectSharedKeys('de'), collectSharedKeys('en')]

for (const key of deShared.keys()) {
  if (!enShared.has(key)) {
    problems.push(`fehlt in en: ${key} (${deShared.get(key)})`)
  }
}

for (const key of enShared.keys()) {
  if (!deShared.has(key)) {
    problems.push(`fehlt in de: ${key} (${enShared.get(key)})`)
  }
}

const known = new Set([...deWeb.keys(), ...enWeb.keys()])

for (const key of collectReferencedKeys()) {
  const [namespace] = key.includes(':') ? key.split(':') : ['common']
  if (!known.has(`${namespace}:${key}`)) {
    problems.push(`referenzierter Key nicht gefunden: ${key}`)
  }
}

if (problems.length > 0) {
  console.error('i18n:check fehlgeschlagen:')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log(
  `i18n:check ok (${deWeb.size + deShared.size} Schlüssel in de, ${enWeb.size + enShared.size} in en)`,
)
