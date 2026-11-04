import { readFileSync } from 'node:fs'

import type { Env } from '../config/env'

/**
 * The installed version of the API image (`specs/18-self-update.md` §18.3).
 *
 * The build argument `GIT_COMMIT` wins: it names the commit the image was
 * built from. A build without that argument falls back to the tracked `VERSION`
 * file of the image — the version of record of this repository, which is an
 * annotated tag upstream and therefore a valid base ref of the GitHub compare
 * endpoint (PLAN.md §18.3).
 *
 * A build without both has no installed version; the check then answers
 * `current: null` and the menu says that the versions cannot be compared.
 */
export function resolveInstalledVersion(
  env: Pick<Env, 'GIT_COMMIT' | 'VERSION_FILE'>,
): string | null {
  const commit = env.GIT_COMMIT.trim()

  if (commit !== '' && commit !== 'unknown') {
    return commit
  }

  return readVersionFile(env.VERSION_FILE)
}

/** The content of the version file; `null` when there is none. */
function readVersionFile(path: string): string | null {
  if (path.trim() === '') {
    return null
  }

  try {
    const content = readFileSync(path, 'utf8').trim()

    return content === '' ? null : content
  } catch {
    // The file is optional: a build without it simply has no version.
    return null
  }
}
