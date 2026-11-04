import { describe, expect, it } from 'vitest'

import { isPublicReportPath } from '../sw-routes'

describe('isPublicReportPath', () => {
  it('matches the public report POST through the default API base', () => {
    expect(isPublicReportPath('/api/v1/public/tickets')).toBe(true)
  })

  it('matches a deployment without an API base prefix', () => {
    expect(isPublicReportPath('/v1/public/tickets')).toBe(true)
  })

  it('does not match the other public ticket routes', () => {
    expect(isPublicReportPath('/api/v1/public/tickets/open')).toBe(false)
    expect(isPublicReportPath('/api/v1/public/tickets/abc/status')).toBe(false)
    expect(isPublicReportPath('/api/v1/public/tickets/ST-2026-0001/comments')).toBe(false)
  })
})
