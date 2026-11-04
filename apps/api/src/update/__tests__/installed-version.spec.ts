import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveInstalledVersion } from '../installed-version.js'

describe('resolveInstalledVersion', () => {
  it('prefers the commit of the build', () => {
    expect(
      resolveInstalledVersion({ GIT_COMMIT: 'abc1234', VERSION_FILE: '/nonexistent/VERSION' }),
    ).toBe('abc1234')
  })

  it('ignores the unknown placeholder of the build', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stoerdesk-version-'))
    const file = join(directory, 'VERSION')

    await writeFile(file, 'v0.0.42\n', 'utf8')

    expect(resolveInstalledVersion({ GIT_COMMIT: 'unknown', VERSION_FILE: file })).toBe('v0.0.42')
    expect(resolveInstalledVersion({ GIT_COMMIT: '', VERSION_FILE: file })).toBe('v0.0.42')

    await rm(directory, { recursive: true, force: true })
  })

  it('answers no version without a build argument and without a file', () => {
    expect(
      resolveInstalledVersion({ GIT_COMMIT: '', VERSION_FILE: '/nonexistent/VERSION' }),
    ).toBeNull()
  })
})
