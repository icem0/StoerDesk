#!/usr/bin/env node
// E2E runner of WP-M1-12: prepares a throwaway database, runs the Playwright smoke
// tests against it and drops the database again. `npm run test:e2e` calls it, and it is
// the last gate of `npm run check`.
//
//   npm run test:e2e
//
// Prerequisites are the same as for the API integration tests: a reachable PostgreSQL
// (`TEST_DATABASE_URL`, fallback `DATABASE_URL`) and a Chromium that really starts. Without
// one of them the runner prints a single notice and exits 0, so `npm run check` never turns
// red because a developer machine has no database or no browser (AGENTS.md
// _Database and tests_). The same rule as `scripts/docker-smoke.sh`, which needs Docker.
// In CI (`CI=true`) both prerequisites are installed by the `check` job, so a missing one
// is an error there and never a green skip. `E2E_CHROMIUM_PATH` selects a distribution
// browser for containers that cannot run the bundled build.
//
// The E2E never writes into a shared database: it creates `stoerdesk_e2e_<run>` itself
// and skips when the account is not allowed to `CREATE DATABASE`.

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import postgres from 'postgres'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(repoRoot, 'apps', 'api')

// dotenv never overwrites an exported variable, so a CI env wins over a local `.env`.
loadDotenv({ path: join(repoRoot, '.env'), quiet: true })

// Credentials of the bootstrap administrator inside the throwaway database: throwaway
// values of a database that is dropped afterwards, not a real account and never PII.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'

// E2E-only ports, so a developer stack on 3000/5173 and the Docker smoke test on 3180
// are never touched.
const apiPort = process.env.E2E_API_PORT ?? '3174'
const webPort = process.env.E2E_WEB_PORT ?? '5174'

// A distribution browser (musl containers cannot run the bundled glibc build) — the
// `playwright.config.ts` launcher uses the same variable.
const chromiumPath = process.env.E2E_CHROMIUM_PATH?.trim() ?? ''

// In CI a missing prerequisite is a real defect, never a skip — only a developer machine
// may run the gate with a green skip notice.
const strict = process.env.CI === 'true'

const defaultBaseUrl = 'postgres://stoerdesk:stoerdesk@localhost:5432/stoerdesk'

function notice(message) {
  process.stdout.write(`e2e: ${message}\n`)
}

function skipped(message) {
  notice(`${strict ? 'FAILED' : 'skipped'}: ${message}`)

  return strict ? 1 : 0
}

function baseDatabaseUrl() {
  for (const key of ['TEST_DATABASE_URL', 'DATABASE_URL']) {
    const value = process.env[key]?.trim()

    if (value !== undefined && value !== '') {
      return value
    }
  }

  return defaultBaseUrl
}

/** Same URL rewrite the API integration tests use (`helpers/testDatabase.ts`). */
function withDatabase(url, database) {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`

  return parsed.toString()
}

/**
 * A path check is not enough: the bundled build exists on musl systems but cannot start.
 * The probe launches exactly the browser the tests will launch, so a broken or missing
 * browser is recognised before any server or database is prepared.
 */
async function browserProbe() {
  try {
    const browser = await chromium.launch(
      chromiumPath === '' ? undefined : { executablePath: chromiumPath },
    )

    await browser.close()

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

function connect(url) {
  return postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 })
}

async function reachable(url) {
  const client = connect(url)

  try {
    await client`select 1`

    return true
  } catch {
    return false
  } finally {
    await client.end({ timeout: 1 })
  }
}

async function createDatabase(adminUrl, database) {
  const client = connect(adminUrl)

  try {
    await client.unsafe(`CREATE DATABASE "${database}"`)

    return true
  } catch {
    return false
  } finally {
    await client.end({ timeout: 1 })
  }
}

async function dropDatabase(adminUrl, database) {
  const client = connect(adminUrl)

  try {
    await client.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  } finally {
    await client.end({ timeout: 1 })
  }
}

/** Runs one command of the prepare chain (migrate, seed-rbac, seed-base) in `apps/api`. */
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })

  if (result.status !== 0) {
    // The seeds print status JSON only — no e-mail and no password in their output.
    process.stderr.write(`e2e: ${args.join(' ')} failed\n${result.stderr ?? result.stdout ?? ''}`)
  }

  return result.status === 0
}

async function main() {
  const browser = await browserProbe()

  if (!browser.ok) {
    return skipped(
      `no usable Chromium (${browser.reason.slice(0, 120)}) — ` +
        'run "npx playwright install chromium" or point E2E_CHROMIUM_PATH at a ' +
        'distribution browser',
    )
  }

  const baseUrl = baseDatabaseUrl()

  if (!(await reachable(baseUrl))) {
    return skipped(
      'no reachable PostgreSQL (TEST_DATABASE_URL / DATABASE_URL) — ' +
        'start it with "docker compose -f docker-compose.dev.yml up -d db"',
    )
  }

  const database = `stoerdesk_e2e_${Date.now().toString(36)}${process.pid.toString(36)}`

  if (!(await createDatabase(withDatabase(baseUrl, 'postgres'), database))) {
    return skipped('the database account may not CREATE DATABASE — the E2E needs its own')
  }

  const targetUrl = withDatabase(baseUrl, database)
  const prepared = {
    ...process.env,
    DATABASE_URL: targetUrl,
    SEED_ADMIN_EMAIL: adminEmail,
    SEED_ADMIN_PASSWORD: adminPassword,
  }

  try {
    for (const step of [['src/db/migrate.ts'], ['src/db/seed-rbac.ts'], ['src/db/seed-base.ts']]) {
      if (!run('npx', ['tsx', ...step], apiDir, prepared)) {
        return 1
      }
    }

    notice(`prepared throwaway database ${database}`)

    const result = spawnSync(
      'npx',
      ['playwright', 'test', '--config', 'apps/web/playwright.config.ts'],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: {
          ...prepared,
          E2E_DATABASE_URL: targetUrl,
          E2E_ADMIN_EMAIL: adminEmail,
          E2E_ADMIN_PASSWORD: adminPassword,
          E2E_API_PORT: apiPort,
          E2E_WEB_PORT: webPort,
        },
      },
    )

    return result.status ?? 1
  } finally {
    await dropDatabase(withDatabase(baseUrl, 'postgres'), database)
    notice(`dropped throwaway database ${database}`)
  }
}

process.exitCode = await main()
