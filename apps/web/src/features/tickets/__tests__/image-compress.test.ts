import { describe, expect, it } from 'vitest'

import { dataUrlByteSize, scaledSize } from '../image-compress'

/**
 * Pure math of the client compressor (`specs/06-report-form.md` §7.2, WP-M2-05b).
 * The canvas itself is proven by the browser E2E (WP-M2-05c), because jsdom has no
 * canvas — here only the edge rule of `PLAN.md` §10 (max. 1600 px, no up-scaling).
 */
describe('scaledSize', () => {
  it('keeps a bitmap that already fits unchanged', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(scaledSize(1600, 900)).toEqual({ width: 1600, height: 900 })
  })

  it('caps the longest edge at 1600 px and keeps the aspect ratio', () => {
    expect(scaledSize(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(scaledSize(1600, 3200)).toEqual({ width: 800, height: 1600 })
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
  })

  it('never up-scales and never rounds an edge down to zero', () => {
    expect(scaledSize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(scaledSize(4000, 1)).toEqual({ width: 1600, height: 1 })
  })

  it('honours a custom maximum', () => {
    expect(scaledSize(400, 200, 100)).toEqual({ width: 100, height: 50 })
  })
})

describe('dataUrlByteSize', () => {
  it('derives the decoded size from the base64 payload', () => {
    expect(dataUrlByteSize('data:image/jpeg;base64,AAAA')).toBe(3)
    expect(dataUrlByteSize('data:image/png;base64,AAA=')).toBe(2)
    expect(dataUrlByteSize('data:image/png;base64,AA==')).toBe(1)
    expect(dataUrlByteSize('not-a-data-url')).toBe(0)
  })
})
