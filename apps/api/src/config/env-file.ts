import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Locates the `.env` file of the repository.
 *
 * The file lives in the repository root, but the processes that need it run
 * from different working directories (`apps/api`, `apps/web`, the repository
 * root) or from a container without the file at all. The lookup therefore
 * walks upwards from the working directory and returns the first match.
 */
export function findEnvFile(): string | undefined {
  let directory = process.cwd()

  for (let level = 0; level < 6; level += 1) {
    const candidate = join(directory, '.env')

    if (existsSync(candidate)) {
      return candidate
    }

    const parent = dirname(directory)

    if (parent === directory) {
      break
    }

    directory = parent
  }

  return existsSync(resolve('.env')) ? resolve('.env') : undefined
}
