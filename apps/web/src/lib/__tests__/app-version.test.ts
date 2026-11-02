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

  it('returns null when no source carries a version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-app-version-empty-'))

    expect(
      resolveAppVersion(undefined, { getGitVersion: () => null, versionFileDirs: [dir] }),
    ).toBeNull()
  })
})
