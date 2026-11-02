import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  gitVersion,
  normalizeAppVersion,
  resolveAppVersion,
  versionFileAppVersion,
} from '../../../app-version.mjs'

/** A throwaway repository with a version tag and a moving pointer tag. */
function repositoryWithPointerTag(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-git-'))
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir })

  git(['init', '--quiet'])
  git(['config', 'user.email', 'test@example.org'])
  git(['config', 'user.name', 'Test'])
  writeFileSync(join(dir, 'file.txt'), 'content\n')
  git(['add', '.'])
  git(['commit', '--quiet', '-m', 'init'])
  git(['tag', '-a', 'v1.2.3', '-m', 'v1.2.3'])
  git(['tag', '-a', 'latest', '-m', 'latest'])

  return dir
}

describe('app-version', () => {
  it('accepts the development version as-is', () => {
    expect(normalizeAppVersion('v0.0.93')).toBe('v0.0.93')
    expect(normalizeAppVersion(' v1.2.3-rc.1 ')).toBe('v1.2.3-rc.1')
    expect(normalizeAppVersion('latest')).toBe('latest')
  })

  it('treats empty values as not configured', () => {
    expect(normalizeAppVersion('')).toBeNull()
    expect(normalizeAppVersion('   ')).toBeNull()
    expect(normalizeAppVersion(undefined)).toBeNull()
  })

  it('prefers the explicit build argument over the VERSION file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-'))
    writeFileSync(join(dir, 'VERSION'), 'v0.0.93\n')

    const resolved = resolveAppVersion('v2.0.0-rc.1', { versionFileDirs: [dir] })

    expect(resolved).toBe('v2.0.0-rc.1')
  })

  it('reads the VERSION file in a build without git metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-'))
    writeFileSync(join(dir, 'VERSION'), 'v0.0.93\n')

    expect(versionFileAppVersion(dir)).toBe('v0.0.93')
    expect(
      resolveAppVersion(undefined, { getGitVersion: () => 'v9.9.9', versionFileDirs: [dir] }),
    ).toBe('v0.0.93')
  })

  it('falls back to the nearest git tag for a local checkout', () => {
    expect(gitVersion()).toMatch(/^v\d+\.\d+\.\d+/)
    expect(
      resolveAppVersion(undefined, {
        getGitVersion: () => 'v0.0.93',
        versionFileDirs: [mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-empty-'))],
      }),
    ).toBe('v0.0.93')
  })

  it('ignores a moving pointer tag and answers the nearest version tag', () => {
    // A release pointer such as `latest` is not a version: it must never become
    // the version of the shell.
    expect(gitVersion(repositoryWithPointerTag())).toBe('v1.2.3')
  })

  it('returns null when no source carries a version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-empty-'))

    expect(
      resolveAppVersion(undefined, { getGitVersion: () => null, versionFileDirs: [dir] }),
    ).toBeNull()
  })
})
