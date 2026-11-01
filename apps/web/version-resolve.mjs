// Version resolution for the web shell — the single place that decides which version
// the UI shows (WP-M1-15, WP-M1-16). A real `vMAJOR.MINOR.PATCH` version always wins:
// explicit build argument, else the nearest git tag, else the root `.env`. The template
// value `dev` from `.env.example` means "not set" and is never displayed.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/

/** The explicit value only counts when it is a real version; `dev` and empty do not. */
export function isRealVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value.trim())
}

/** Nearest annotated version tag, absent in a Docker build without a `.git` directory. */
export function gitVersion() {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** `VITE_APP_VERSION` of the root `.env`, kept current by `npm run env:version`. */
export function envFileVersion(...searchDirs) {
  for (const dir of searchDirs) {
    const envPath = join(dir, '.env')

    if (!existsSync(envPath)) {
      continue
    }

    const match = /^VITE_APP_VERSION=(.+)$/m.exec(readFileSync(envPath, 'utf8'))

    if (match?.[1] !== undefined) {
      return match[1].trim()
    }
  }

  return null
}

/**
 * The version to bake into the bundle, or `null` when no real version exists —
 * callers then fall back (`dev` in a local dev server, a build error in the image).
 */
export function resolveVersion(configured, { getGitVersion = gitVersion, envFileDirs } = {}) {
  if (isRealVersion(configured)) {
    return configured.trim()
  }

  const fromGit = getGitVersion()

  if (isRealVersion(fromGit)) {
    return fromGit.trim()
  }

  const dirs = envFileDirs ?? [
    dirname(process.cwd()),
    process.cwd(),
    dirname(dirname(fileURLToPath(import.meta.url))),
  ]
  const fromEnvFile = envFileVersion(...dirs)

  return isRealVersion(fromEnvFile) ? fromEnvFile.trim() : null
}
