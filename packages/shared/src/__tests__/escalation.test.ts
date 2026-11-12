import { describe, expect, it } from 'vitest'

import { positiveMinutes } from '../escalation'

describe('positiveMinutes', () => {
  it('accepts a positive minute value', () => {
    expect(positiveMinutes(15)).toBe(15)
    expect(positiveMinutes(1)).toBe(1)
  })

  it('rejects zero, negative and non-finite values', () => {
    expect(positiveMinutes(0)).toBeUndefined()
    expect(positiveMinutes(-4)).toBeUndefined()
    expect(positiveMinutes(Number.NaN)).toBeUndefined()
    expect(positiveMinutes(undefined)).toBeUndefined()
  })
})
