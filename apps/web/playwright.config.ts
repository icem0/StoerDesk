import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * E2E setup of WP-M1-12: a real Chromium drives the real web app against the real API and
 * a real PostgreSQL. The database is prepared by `scripts/e2e-check.mjs` (throwaway
 * database, migrations, both seeds) and handed over through `E2E_DATABASE_URL`; the ports
 * are E2E-only so a developer stack on 3000/5173 is never touched.
 *
 * The web side runs on the Vite **dev** server, because that is the setup without an
 * image: only the dev server proxies `/api` to `API_PORT`, while `vite preview` and the
 * PWA image use nginx instead — that path is covered by `scripts/docker-smoke.sh`.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const apiPort = Number(process.env.E2E_API_PORT ?? 3174)
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174)
const baseURL = `http://127.0.0.1:${webPort}`

/** Empty means "the API resolves its own default", exactly like `npm run dev`. */
const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: String(apiPort),
  API_LOG_LEVEL: 'warn',
  CORS_ORIGIN: baseURL,
  TRUST_PROXY: 'false',
  COOKIE_SECURE: 'false',
  // E2E-only value so a developer `.env` never changes the run; the schema asks for 32+.
  SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef-never-a-real-secret',
  SESSION_TTL_HOURS: '1',
}

if (databaseUrl !== '') {
  apiEnv.DATABASE_URL = databaseUrl
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // The seeded administrator and the rate limit are shared state — one worker only.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI === 'true' ? 'line' : 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    // Alpine and other musl containers cannot run the bundled glibc build; there a
    // distribution Chromium works. The browser probe of `scripts/e2e-check.mjs` uses the
    // same override, so a missing browser stays a notice instead of a red gate.
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM_PATH ?? undefined,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'npm run start -w @stoerdesk/api',
      cwd: repoRoot,
      port: apiPort,
      env: apiEnv,
      timeout: 120_000,
      reuseExistingServer: process.env.CI !== 'true',
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `npm run dev -w @stoerdesk/web -- --port ${String(webPort)} --strictPort`,
      cwd: repoRoot,
      port: webPort,
      env: { API_PORT: String(apiPort) },
      timeout: 120_000,
      reuseExistingServer: process.env.CI !== 'true',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
