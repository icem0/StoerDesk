import { describe, it } from 'vitest'

describe('diagnostics', () => {
  it('checks env and fetch', () => {
    console.log('VITE_API_BASE_URL:', (import.meta as any).env?.VITE_API_BASE_URL)
    console.log('fetch type:', typeof globalThis.fetch)
    console.log('Response type:', typeof globalThis.Response)
  })
})
