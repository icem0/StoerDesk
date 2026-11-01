import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { envFileVersion, isRealVersion, resolveVersion } from '../../../version-resolve.mjs'

describe('version-resolve', () => {
  it('accepts only real vMAJOR.MINOR.PATCH versions', () => {
    expect(isRealVersion('v0.0.89')).toBe(true)
    expect(isRealVersion(' dev ')).toBe(false)
    expect(isRealVersion('dev')).toBe(false)
    expect(isRealVersion('')).toBe(false)
    expect(isRealVersion(undefined)).toBe(false)
  })

  it('prefers the explicit version over git', () => {
    const resolved = resolveVersion('v1.2.3', {
      getGitVersion: () => 'v9.9.9',
      envFileDirs: [],
    })

    expect(resolved).toBe('v1.2.3')
  })

  it('ignores the `dev` placeholder and takes the git tag', () => {
    const resolved = resolveVersion('dev', {
      getGitVersion: () => 'v0.0.89',
      envFileDirs: [],
    })

    expect(resolved).toBe('v0.0.89')
  })

  it('falls back to the root .env when git is unavailable (image build)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoerdesk-version-'))
    writeFileSync(join(dir, '.env'), 'SECRET=irrelevant\nVITE_APP_VERSION=v0.0.42\n')

    const resolved = resolveVersion(undefined, {
      getGitVersion: () => null,
      envFileDirs: [dir],
    })

    expect(resolved).toBe('v0.0.42')
    expect(envFileVersion(dir)).toBe('v0.0.42')
  })

  it('returns null when no source carries a real version', () => {
    const resolved = resolveVersion('dev', {
      getGitVersion: () => null,
      envFileDirs: [mkdtempSync(join(tmpdir(), 'stoerdesk-version-empty-'))],
    })

    expect(resolved).toBeNull()
  })
})
