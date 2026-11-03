import { describe, expect, it } from 'vitest'

import {
  agentStatusSchema,
  updateRunSchema,
  updateRunsResponseSchema,
  updateStatusResponseSchema,
} from '../schemas/update.js'

describe('update schemas', () => {
  it('accepts a complete agent status', () => {
    const parsed = agentStatusSchema.parse({
      state: 'idle',
      checkout: { version: 'v0.1.79', commit: 'abc1234' },
      lastRun: {
        id: 'run-1',
        status: 'SUCCESS',
        startedAt: '2026-11-03T10:00:00.000Z',
        finishedAt: '2026-11-03T10:01:00.000Z',
        beforeVersion: 'v0.1.78',
        afterVersion: 'v0.1.79',
        errorCode: null,
        steps: [{ step: 'git', status: 'ok', errorCode: null }],
      },
    })

    expect(parsed.state).toBe('idle')
    expect(parsed.lastRun?.afterVersion).toBe('v0.1.79')
  })

  it('rejects a malformed agent answer', () => {
    expect(() => agentStatusSchema.parse({ state: 'unknown' })).toThrow()
    expect(() => agentStatusSchema.parse({ state: 'idle', checkout: {} })).toThrow()
  })

  it('rejects a run row without an id or with an unknown status', () => {
    expect(() => updateRunSchema.parse({ id: 'not-a-uuid', status: 'SUCCESS' })).toThrow()
    expect(() =>
      updateRunSchema.parse({
        id: '8f14e45f-ceea-4b1a-9d2c-6f3a5b7c8d90',
        status: 'DONE',
      }),
    ).toThrow()
  })

  it('answers the status of the admin routes', () => {
    const status = updateStatusResponseSchema.parse({
      agent: { reachable: false, state: null, error: 'update_agent_not_configured' },
      running: false,
      currentVersion: null,
      lastRun: null,
    })

    expect(status.agent.reachable).toBe(false)
    expect(status.agent.error).toBe('update_agent_not_configured')

    const runs = updateRunsResponseSchema.parse({ runs: [] })

    expect(runs.runs).toEqual([])
  })

  it('rejects an unknown agent error', () => {
    expect(() =>
      updateStatusResponseSchema.parse({
        agent: { reachable: false, state: null, error: 'update_broken' },
        running: false,
        currentVersion: null,
        lastRun: null,
      }),
    ).toThrow()
  })
})
