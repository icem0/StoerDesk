import { describe, it, expect } from 'vitest'

describe('diagnostics', () => {
  it('checks fetch availability', () => {
    // eslint-disable-next-line no-console
    console.log('DIAG fetch:', typeof globalThis.fetch)
    // eslint-disable-next-line no-console
    console.log('DIAG Response:', typeof globalThis.Response)
    // eslint-disable-next-line no-console
    console.log('DIAG VITE_API_BASE_URL:', (import.meta as any).env?.VITE_API_BASE_URL)
    expect(true).toBe(true)
  })
})
