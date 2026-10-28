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

const DEFAULT_NAMESPACE = 'common'

function fileDefaultNamespace(content: string): string {
  return content.match(/\buseTranslation\(\s*['"]([a-zA-Z0-9_-]+)['"]/)?.[1] ?? DEFAULT_NAMESPACE
}

function collectReferencedKeys(content: string): string[] {
  const pattern = /\bt\(\s*['"]([a-zA-Z0-9_.:-]+)['"]([^)]*)/g
  const optionPattern = /\bns:\s*['"]([a-zA-Z0-9_-]+)['"]/
  const referenced = new Set<string>()
  const fileDefault = fileDefaultNamespace(content)

  for (const match of content.matchAll(pattern)) {
    const rawKey = match[1]
    const options = match[2] ?? ''
    if (!rawKey || options.includes('defaultValue')) {
      continue
    }

    const namespace =
      rawKey.includes(':') === true
        ? rawKey.slice(0, rawKey.indexOf(':'))
        : (optionPattern.exec(options)?.[1] ?? fileDefault)
    const key = rawKey.includes(':') === true ? rawKey.slice(rawKey.indexOf(':') + 1) : rawKey

    referenced.add(`${namespace}:${key}`)
  }

  return [...referenced]
}

const problems: string[] = []

const [deWeb, enWeb] = [collectWebKeys('de'), collectWebKeys('en')]

for (const key of deWeb.keys()) {
  if (!enWeb.has(key)) {
    problems.push(`missing in en: ${key} (${deWeb.get(key)})`)
  }
}

for (const key of enWeb.keys()) {
  if (!deWeb.has(key)) {
    problems.push(`missing in de: ${key} (${enWeb.get(key)})`)
  }
}

const [deShared, enShared] = [collectSharedKeys('de'), collectSharedKeys('en')]

for (const key of deShared.keys()) {
  if (!enShared.has(key)) {
    problems.push(`missing in en: ${key} (${deShared.get(key)})`)
  }
}

for (const key of enShared.keys()) {
  if (!deShared.has(key)) {
    problems.push(`missing in de: ${key} (${enShared.get(key)})`)
  }
}

const known = new Set([...deWeb.keys(), ...enWeb.keys()])

for (const file of listSourceFiles(join(repoRoot, 'apps/web/src'))) {
  for (const key of collectReferencedKeys(readFileSync(file, 'utf8'))) {
    if (!known.has(key)) {
      problems.push(`referenced key not found: ${key} (${relative(repoRoot, file)})`)
    }
  }
}

if (problems.length > 0) {
  console.error('i18n:check failed:')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log(
  `i18n:check ok (${deWeb.size + deShared.size} keys in de, ${enWeb.size + enShared.size} keys in en)`,
)
