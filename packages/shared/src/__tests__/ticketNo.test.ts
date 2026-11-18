import { describe, expect, it } from 'vitest'

import { ticketNoSchema } from '../schemas/ticket.js'

describe('ticketNoSchema', () => {
  it('accepts the year-free number of ADR-0027', () => {
    expect(ticketNoSchema.safeParse('ST-0001').success).toBe(true)
    expect(ticketNoSchema.safeParse('ST-0121').success).toBe(true)
    expect(ticketNoSchema.safeParse('ST-10000').success).toBe(true)
  })

  it('accepts a number of the yearly counter, because a number is never rewritten', () => {
    expect(ticketNoSchema.safeParse('ST-2026-0001').success).toBe(true)
    expect(ticketNoSchema.safeParse('ST-9999-9999').success).toBe(true)
  })

  it('rejects a malformed number', () => {
    expect(ticketNoSchema.safeParse('ST-1').success).toBe(false)
    expect(ticketNoSchema.safeParse('st-0001').success).toBe(false)
    expect(ticketNoSchema.safeParse('ST-2026-26-1').success).toBe(false)
    expect(ticketNoSchema.safeParse('ST-00000-00000-00000').success).toBe(false)
    expect(ticketNoSchema.safeParse('').success).toBe(false)
  })
})
