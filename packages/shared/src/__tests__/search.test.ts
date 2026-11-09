import { describe, expect, it } from 'vitest'

import { escapeLikePattern } from '../search'

describe('escapeLikePattern', () => {
  it('passes a plain search through unchanged', () => {
    expect(escapeLikePattern('Beta 6003')).toBe('Beta 6003')
    expect(escapeLikePattern('')).toBe('')
  })

  it('escapes every LIKE wildcard and the escape character itself', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('C:\\Temp')).toBe('C:\\\\Temp')
  })

  it('escapes each occurrence, never only the first one', () => {
    expect(escapeLikePattern('%_%\\')).toBe('\\%\\_\\%\\\\')
  })

  it('keeps the closing wildcard of the wrapped pattern escapable', () => {
    expect(escapeLikePattern('x\\')).toBe('x\\\\')
    expect(`%${escapeLikePattern('x\\')}%`).toBe('%x\\\\%')
  })
})
