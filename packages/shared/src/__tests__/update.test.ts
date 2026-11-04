import { describe, expect, it } from 'vitest'

import {
  updateCheckResponseSchema,
  updateCommitSchema,
  updateStartResponseSchema,
} from '../schemas/update.js'

describe('update schemas', () => {
  it('accepts a commit of the check answer', () => {
    const parsed = updateCommitSchema.parse({
      sha: '1a2b3c4d5e6f',
      message: 'fix(api): answer the check',
      date: '2026-11-04T10:00:00.000Z',
    })

    expect(parsed.sha).toBe('1a2b3c4d5e6f')
    expect(parsed.message).toBe('fix(api): answer the check')
  })

  it('rejects a commit without a sha', () => {
    expect(() => updateCommitSchema.parse({ message: 'fix', date: '2026-11-04T10:00:00.000Z' })).toThrow()
  })

  it('answers the check of the admin route', () => {
    const parsed = updateCheckResponseSchema.parse({
      current: 'abc1234def5678',
      latest: '1a2b3c4',
      updateAvailable: true,
      commitsBehind: 2,
      commits: [
        { sha: '1a2b3c4', message: 'fix(api): one', date: '2026-11-04T10:00:00.000Z' },
        { sha: '2b3c4d5', message: 'fix(api): two', date: '2026-11-04T09:00:00.000Z' },
      ],
      checkedAt: '2026-11-04T10:05:00.000Z',
    })

    expect(parsed.updateAvailable).toBe(true)
    expect(parsed.commitsBehind).toBe(2)
    expect(parsed.commits).toHaveLength(2)
  })

  it('accepts an unknown installed version and an unknown comparison', () => {
    const parsed = updateCheckResponseSchema.parse({
      current: null,
      latest: null,
      updateAvailable: false,
      commitsBehind: null,
      commits: [],
      checkedAt: '2026-11-04T10:05:00.000Z',
    })

    expect(parsed.current).toBeNull()
    expect(parsed.commitsBehind).toBeNull()
  })

  it('rejects a negative number of commits', () => {
    expect(() =>
      updateCheckResponseSchema.parse({
        current: 'abc1234',
        latest: '1a2b3c4',
        updateAvailable: false,
        commitsBehind: -1,
        commits: [],
        checkedAt: '2026-11-04T10:05:00.000Z',
      }),
    ).toThrow()
  })

  it('answers the start of the admin route', () => {
    expect(updateStartResponseSchema.parse({ started: true }).started).toBe(true)
    expect(() => updateStartResponseSchema.parse({ started: 'yes' })).toThrow()
  })
})
