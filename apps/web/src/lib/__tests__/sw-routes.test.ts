import { describe, expect, it } from 'vitest'

import { isInternalTicketRead, isPublicReportPath } from '../sw-routes'

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

describe('isInternalTicketRead', () => {
  it('matches the ticket list through the default API base', () => {
    expect(isInternalTicketRead('/api/v1/tickets')).toBe(true)
  })

  it('matches a ticket detail through the default API base', () => {
    expect(isInternalTicketRead('/api/v1/tickets/ST-2026-0001')).toBe(true)
  })

  it('rejects action paths on a ticket detail', () => {
    expect(isInternalTicketRead('/api/v1/tickets/ST-2026-0001/accept')).toBe(false)
    expect(isInternalTicketRead('/api/v1/tickets/ST-2026-0001/claim')).toBe(false)
    expect(isInternalTicketRead('/api/v1/tickets/ST-2026-0001/comments')).toBe(false)
  })

  it('rejects the public report and status paths', () => {
    expect(isInternalTicketRead('/api/v1/public/tickets')).toBe(false)
    expect(isInternalTicketRead('/api/v1/public/tickets/abc/status')).toBe(false)
  })

  it('rejects anything under a non-default API base', () => {
    expect(isInternalTicketRead('/other/v1/tickets')).toBe(false)
    expect(isInternalTicketRead('/other/v1/tickets/ST-2026-0001')).toBe(false)
  })
})
