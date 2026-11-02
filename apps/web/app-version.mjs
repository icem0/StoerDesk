// The version shown in the web shell is the version of THIS application, produced
// by the development workflow: the pre-commit hook writes the next version into the
// tracked `VERSION` file, the post-commit hook tags exactly that value. Docker builds
// have no `.git`, so they read the committed `VERSION` file; a local checkout may
// additionally fall back to the nearest tag.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Any non-empty string is valid: `v1.2.3`, `v1.2.3-rc.1` or `latest`. */
export function normalizeAppVersion(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  return trimmed === '' ? null : trimmed
}

/** `VERSION` file of the repository, or `null` when it is missing or empty. */
export function versionFileAppVersion(...searchDirs) {
  for (const dir of searchDirs) {
    const versionPath = join(dir, 'VERSION')

    if (!existsSync(versionPath)) {
      continue
    }

    const value = normalizeAppVersion(readFileSync(versionPath, 'utf8'))

    if (value !== null) {
      return value
    }
  }

  return null
}

/**
 * Nearest annotated **version** tag; absent in an image build without `.git`.
 *
 * Only version tags count (`--match 'v[0-9]*'`): a moving pointer tag such as
 * `latest` is not a version and must neither become the version of the shell
 * nor break the test that reads it.
 */
export function gitVersion(cwd = process.cwd()) {
  try {
    return normalizeAppVersion(
      execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return null
  }
}

/**
 * The explicit build argument wins (CI passes the release tag), then the committed
 * `VERSION` file (any Docker build), then the nearest git tag (local checkout).
 */
export function resolveAppVersion(
  configured,
  { getGitVersion = gitVersion, versionFileDirs } = {},
) {
  const direct = normalizeAppVersion(configured)

  if (direct !== null) {
    return direct
  }

  const dirs = versionFileDirs ?? [repoRoot, process.cwd(), dirname(process.cwd())]
  const fromFile = versionFileAppVersion(...dirs)

  return fromFile ?? getGitVersion()
}
