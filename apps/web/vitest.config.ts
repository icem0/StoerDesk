import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    /*
      The tests of the web run in a VM thread and not in a child process
      (WP-M28-01). The pool keeps the isolation of every test file — every file
      gets its own module registry and its own mocks — but the jsdom environment
      and the transformed modules are shared inside a worker.

      Without it, every one of the 88 test files built its own jsdom and
      evaluated the whole module graph of the app again: 288 modules were
      evaluated 2399 times, and the 88 jsdom environments cost 111 s of the
      139 s of the whole suite. With the pool the web project needs 13 s
      instead of 36 s, and the 540 cases stay green.

      `isolate: false` would be faster still, but the tests share the globals of
      the window with each other then: 227 cases failed. The VM thread keeps
      the files apart.
    */
    pool: 'vmThreads',
  },
})
