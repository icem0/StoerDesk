#!/usr/bin/env node
// WP-M12-02: the acceptance runner of `specs/16-acceptance.md` §16.1, items 1–12.
//
//   node scripts/e2e-acceptance.mjs
//
// One ordered run against a throwaway database `stoerdesk_e2e_<run>` and the running
// API/web pair — the harness shape of `scripts/e2e-check.mjs` (migrate + seed-rbac +
// seed-base preparation, the Chromium probe, the `E2E_*` env and ports, the `CI=true`
// strictness rule of `PLAN.md` §18.2). Every item of §16.1 prints one verdict line
// `<nr>: PASS|FAIL|UNVERIFIED <note>` and the run ends with `acceptance: N/12 verified`.
// A missing prerequisite (Chromium for the browser-driven items, PostgreSQL for all, a
// stack that never answers for the HTTP-driven ones) is `UNVERIFIED (reason)` outside
// CI and `FAIL` in CI (`CI=true`) — never a green skip.
//
// Item 11 is scoped to the web-push **delivery side** (`specs/16-acceptance.md` §16.2/11
// and §16.3): the web app has no push-subscription registration, so the item is
// `UNVERIFIED` by design and never `PASS`. The delivery side (the channel adapter, the
// `push_subscriptions` rows, the payload and VAPID details) is verified and printed.
//
// Everything this run writes stays inside its throwaway database and its own ports. All
// names, e-mails, object numbers and contact values are throwaway fixtures of that
// database (never PII), like the `E2E_ADMIN_EMAIL` of the Playwright E2E specs.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(repoRoot, 'apps', 'api')
const apiSrc = join(apiDir, 'src')

loadDotenv({ path: join(repoRoot, '.env'), quiet: true })

const strict = process.env.CI === 'true'
let suiteDatabaseUrl = ''
const apiPort = process.env.E2E_API_PORT ?? '3174'
const webPort = process.env.E2E_WEB_PORT ?? '5174'
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.invalid'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-only-admin-password-1'
const techEmail = 'tech-a@e2e.invalid'
const techPassword = 'e2e-only-tech-password-1'
const chromiumPath = process.env.E2E_CHROMIUM_PATH?.trim() ?? ''
const uploadDir = mkdtempSync(join(tmpdir(), 'stoerdesk-e2e-acceptance-uploads-'))
const mockPort = 47_137

const apiBase = `http://127.0.0.1:${apiPort}`
const webBase = `http://127.0.0.1:${webPort}`

const defaultBaseUrl = 'postgres://stoerdesk:stoerdesk@localhost:5432/stoerdesk'

function notice(message) {
  process.stdout.write(`acceptance: ${message}\n`)
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

async function connect(url) {
  const postgres = (await import('postgres')).default

  return postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 })
}

async function reachable(url) {
  const client = await connect(url)

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
  const client = await connect(adminUrl)

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
  const client = await connect(adminUrl)

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
    notice(`${args.join(' ')} failed: ${String(result.stderr ?? result.stdout ?? '').trim().slice(0, 400)}`)
  }

  return result.status === 0
}

/**
 * Product code against the throwaway database — the integration-test pattern of the
 * phase-exit specs (drizzle + product modules imported by absolute path, one JSON line
 * printed). Used where a criterion names a service function the running stack only
 * calls from its scheduled jobs: escalation scan, outbox drain, channel adapter,
 * statistics reference seed.
 */
function oneShot(label, body, extraEnv = {}) {
  const bodyLines = body.split('\n')
  const hoisted = bodyLines.filter((line) => /^\s*import\b/.test(line)).map((line) => line.trim())
  const kept = bodyLines.filter((line) => !/^\s*import\b/.test(line)).join('\n')
  const code = `
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '${join(apiSrc, 'db/schema')}'
import { eq } from 'drizzle-orm'
${hoisted.join('\n')}
async function main() {
  const client = postgres(process.env.DATABASE_URL, { max: 2 })
  const db = drizzle(client, { schema })
${kept}
  await client.end({ timeout: 5 })
}
void main().catch((error) => {
  process.stderr.write(String(error) + '\\n')
  process.stderr.write('cause: ' + (((error as {cause?: unknown}).cause as {code?: string})?.code ?? '-') + ' ' + (((error as {cause?: unknown}).cause as {detail?: string})?.detail ?? '') + ' ' + (((error as {cause?: unknown}).cause as {constraint?: string})?.constraint ?? '') + '\\n')
  process.exit(1)
})
`
  const result = spawnSync('npx', ['tsx', '-e', code], {
    cwd: apiSrc,
    env: { ...process.env, ...extraEnv, ...(suiteDatabaseUrl === '' ? {} : { DATABASE_URL: suiteDatabaseUrl }) },
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    notice(`one-shot ${label} failed: ${String(result.stderr ?? '').trim().slice(0, 3000)}`)

    return { ok: false, data: null }
  }

  const lines = String(result.stdout ?? '').split('\n').filter((line) => line.trim() !== '')

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return { ok: true, data: JSON.parse(lines[index]) }
    } catch {
      // only the last JSON line counts
    }
  }

  notice(`one-shot ${label} printed no JSON`)

  return { ok: false, data: null }
}

async function apiRequest(method, path, { cookie = '', bearer = '', json }) {
  const headers = {}

  if (cookie !== '') {
    headers.cookie = cookie
  }

  if (bearer !== '') {
    headers.authorization = `Bearer ${bearer}`
  }

  let body

  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  }

  const response = await fetch(`${apiBase}${path}`, { method, headers, body })
  const text = await response.text()

  return { status: response.status, text, data: () => JSON.parse(text) }
}

async function sessionFor(email, password) {
  const response = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const pair = (response.headers.get('set-cookie') ?? '').split(';')[0]

  return { status: response.status, cookie: pair.startsWith('session=') ? pair : '' }
}

async function waitForAnswer(url, tries = 45) {
  for (let index = 0; index < tries; index += 1) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return true
      }
    } catch {
      // the server is not listening yet
    }

    await sleep(2_000)
  }

  return false
}

function sleep(ms) {
  return new Promise((step) => setTimeout(step, ms))
}

/** Starts the mock Matrix homeserver of §16.2/10 — throwaway fixture, no PII. */
async function startMockHomeserver(port, sink) {
  const http = (await import('node:http')).default
  const server = http.createServer((request, response) => {
    let data = ''

    request.on('data', (chunk) => {
      data += chunk
    })
    request.on('end', () => {
      try {
        sink.push(JSON.parse(data === '' ? '{}' : data))
      } catch {
        sink.push({ raw: data })
      }

      response.writeHead(200)
      response.end('{}')
    })
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))

  return server
}

const results = []

function verdict(n, label, state, note) {
  results.push({ n, state })
  process.stdout.write(`${n}: ${state}${note === '' ? '' : ` — ${note}`}\n`)

  return state
}

let browserProbeReason = ''

async function browserProbe() {
  try {
    const browser = await chromium.launch(
      chromiumPath === '' ? undefined : { executablePath: chromiumPath },
    )

    await browser.close()

    return { ok: true }
  } catch (error) {
    browserProbeReason = error instanceof Error ? error.message : String(error)

    return { ok: false, reason: browserProbeReason }
  }
}

/** The 1x1 JPEG of `apps/web/e2e/report-form.spec.ts` (WP-M2-05c) — a fixture, not a photo. */
const onePixelJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
    'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
    'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
    'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
    'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
    'gD//2Q==',
  'base64',
)

const itemNames = [
  'QR report with two photos, office list within 3 s, office notification',
  'flight mode: exactly one ticket, reported_at is the capture time',
  'claim conflict: one wins, the other sees "already claimed"',
  'decline without a reason is impossible (422)',
  'acknowledge: without a note impossible, note and photo stop the timeline',
  'an overdue unclaimed ticket escalates into the history',
  'object API upsert/update/deactivate, 422 field errors',
  'fault-free counter resets on a new report, ignores test tickets',
  'statistics median matches the seeded reference',
  'failed channel retries and falls back, visible in history and dashboard',
  'iPhone push: delivery side verified, browser side unimplemented',
  'on-call: DST slots, decline reason, atomic swap, unstaffed offer',
]

async function main() {
  const browser = await browserProbe()
  const browserMissing = !browser.ok

  const baseUrl = baseDatabaseUrl()

  if (!(await reachable(baseUrl))) {
    return missingAll('no reachable PostgreSQL (TEST_DATABASE_URL / DATABASE_URL)')
  }

  const database = `stoerdesk_e2e_${Date.now().toString(36)}${process.pid.toString(36)}`

  if (!(await createDatabase(withDatabase(baseUrl, 'postgres'), database))) {
    return missingAll('the database account may not CREATE DATABASE — the suite needs its own')
  }

  const targetUrl = withDatabase(baseUrl, database)

  suiteDatabaseUrl = targetUrl

  notice(`prepared throwaway database ${database}`)

  const prepared = {
    ...process.env,
    DATABASE_URL: targetUrl,
    SEED_ADMIN_EMAIL: adminEmail,
    SEED_ADMIN_PASSWORD: adminPassword,
  }

  let apiPid = 0
  let webPid = 0
  let mockHandle = null

  try {
    for (const step of [['src/db/migrate.ts'], ['src/db/seed-rbac.ts'], ['src/db/seed-base.ts']]) {
      if (!run('npx', ['tsx', ...step], apiDir, prepared)) {
        return 1
      }
    }

    const mockBodies = []
    mockHandle = await startMockHomeserver(mockPort, mockBodies)

    const apiChild = spawn('npm', ['run', 'start', '-w', '@stoerdesk/api'], {
      cwd: repoRoot,
      env: {
        ...prepared,
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: apiPort,
        API_LOG_LEVEL: 'warn',
        CORS_ORIGIN: webBase,
        TRUST_PROXY: 'false',
        COOKIE_SECURE: 'false',
        SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef-never-a-real-secret',
        SESSION_TTL_HOURS: '1',
        RATE_LIMIT_MAX: '999999',
        LOGIN_RATE_LIMIT_MAX: '999999',
        UPLOAD_DIR: uploadDir,
        // §16.2/10: the failing first channel and the working fallback channel of the
        // escalation chain — throwaway fixtures of this run only.
        SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
        SIGNAL_SOURCE_NUMBER: '+491234567890',
        SIGNAL_RECIPIENTS: '+491234567891',
        MATRIX_HOMESERVER: `http://127.0.0.1:${mockPort}`,
        MATRIX_ROOM_ID: '!acceptance:e2e.invalid',
        MATRIX_ACCESS_TOKEN: 'e2e-only-matrix-token',
      },
      stdio: 'ignore',
      detached: true,
    })

    void apiChild

    apiPid = apiChild.pid

    const webChild = spawn('npm', ['run', 'dev', '-w', '@stoerdesk/web', '--', '--port', String(webPort), '--strictPort'], {
      cwd: repoRoot,
      env: { ...process.env, API_PORT: apiPort },
      stdio: 'ignore',
      detached: true,
    })

    void webChild

    webPid = webChild.pid

    const apiUp = await waitForAnswer(`${apiBase}/api/v1/health`)
    const webUp = apiUp && await waitForAnswer(webBase, 25)

    if (!apiUp) {
      notice('the API server never answered — the HTTP-driven items are unverified')
    }

    if (!webUp) {
      notice('the web dev server never answered — the browser-driven items are unverified')
    }

    const admin = apiUp ? await sessionFor(adminEmail, adminPassword) : { cookie: '' }

    if (apiUp && admin.cookie === '') {
      notice('the seeded administrator could not sign in — the HTTP-driven items are unverified')
    }

    const ok = apiUp && admin.cookie !== ''

    // one technician of the on-call role for the claim conflict and the atomic swap
    const tech = ok ? await createTechnicianWithAdmin(admin.cookie) : { cookie: '', id: '' }

    // §16.2/12: the staffed pool — the pool through the API, the CONFIRMED shift of
    // the technician through the database (the phase-8 exit pattern, covering now).
    const pool = ok ? await apiRequest('POST', '/api/v1/oncall/pools', {
      cookie: admin.cookie,
      json: { name: 'Acceptance pool' },
    }) : { status: 0 }
    const staffedPoolId = pool.status === 201 ? pool.data().id : ''
    const seededShift =
      ok && tech.id !== ''
        ? oneShot('staffed shift', `
  console.log(JSON.stringify(await db.insert(schema.oncallShifts).values({
    poolId: '${staffedPoolId}',
    userId: '${tech.id}',
    state: 'CONFIRMED',
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    confirmedAt: new Date(),
  }).returning({ id: schema.oncallShifts.id })))
`)
        : { ok: false, data: null }
    const staffedShiftId = seededShift.ok ? String(seededShift.data?.[0]?.id ?? '') : ''

    // §16.2/8+9: the seeded statistics reference of `db/seed-stats-reference`.
    const statsRef = ok
      ? oneShot('stats reference', `
  import { seedStatsReference, REFERENCE_MEDIAN_REVIEW_MINUTES, REFERENCE_LAST_QUALIFYING_REPORTED_AT } from '${join(apiSrc, 'db/seed-stats-reference')}'
  await seedStatsReference(db)
  console.log(JSON.stringify({ median: REFERENCE_MEDIAN_REVIEW_MINUTES, lastQualifying: REFERENCE_LAST_QUALIFYING_REPORTED_AT }))
`)
      : { ok: false, data: null }

    let browserSession = null

    if (!browserMissing && webUp && ok) {
      browserSession = await openBrowser(adminEmail, adminPassword)
    }

    const shared = {
      browserOk: !browserMissing && webUp && ok && browserSession !== null,
      browserMissing,
      ok,
      adminCookie: admin.cookie,
      techCookie: tech.cookie,
      techId: tech.id,
      staffedPoolId,
      staffedShiftId,
      statsRef: statsRef.ok ? statsRef.data : null,
      mockBodies,
      browserSession,
      item1TicketNo: '',
    }

    await item1(shared)
    await item2(shared)
    await item3(shared)
    await item4(shared)
    await item5(shared)
    await item6(shared)
    await item7(shared)
    await item8(shared)
    await item9(shared)
    await item10(shared)
    await item11(shared)
    await item12(shared)

    const verified = results.filter((item) => item.state === 'PASS').length

    notice(`acceptance: ${verified}/12 verified`)

    const failed = results.filter((item) => item.state === 'FAIL')

    if (failed.length > 0) {
      notice(`${failed.length} item(s) failed — a red verdict is a defect to fix in a new commit`)
    }

    return failed.length > 0 || (strict && browserMissing) || (strict && !apiUp) ? 1 : 0
  } finally {
    if (mockHandle !== null) {
      try {
        mockHandle.close()
        mockHandle.closeAllConnections()
      } catch {
        // already closed
      }
    }

    for (const pid of [apiPid, webPid]) {
      if (pid === 0) {
        continue
      }

      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }

    await dropDatabase(withDatabase(baseUrl, 'postgres'), database)
    notice(`dropped throwaway database ${database}`)
  }
}

function missingAll(reason) {
  const state = strict ? 'FAIL' : 'UNVERIFIED'

  for (const index in itemNames) {
    verdict(Number(index) + 1, itemNames[index], state, reason)
  }

  notice(`acceptance: 0/12 verified`)

  return strict ? 1 : 0
}

function browserSkipped(n, label) {
  const state = strict ? 'FAIL' : 'UNVERIFIED'

  return verdict(
    n,
    label,
    state,
    `needs Chromium: ${browserProbeReason.slice(0, 120) || 'no browser probe'} (CI=true fails)`,
  )
}

function stackSkipped(n, label) {
  return verdict(n, label, 'UNVERIFIED', 'the running stack did not answer (see the notices)')
}

async function createTechnicianWithAdmin(adminCookie, email = techEmail, password = techPassword) {
  const created = await apiRequest('POST', '/api/v1/users', {
    cookie: adminCookie,
    json: { email, password, roleKeys: ['oncall'] },
  })

  if (created.status !== 201) {
    notice(`technician ${email} not created (${created.status})`)

    return { cookie: '', id: '' }
  }

  const session = await sessionFor(email, password)

  if (session.cookie === '') {
    return { cookie: '', id: '' }
  }

  const me = await apiRequest('GET', '/api/v1/me', { cookie: session.cookie })

  return { cookie: session.cookie, id: me.status === 200 ? me.data().user.id : '' }
}

async function openBrowser(email, password) {
  const browser = await chromium.launch(
    chromiumPath === '' ? undefined : { executablePath: chromiumPath },
  )
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.setViewportSize({ width: 375, height: 667 })
  await page.addInitScript((lng) => globalThis.localStorage.setItem('i18nextLng', lng), 'de')
  await page.goto(webBase)
  await page.getByRole('heading', { level: 2, name: 'Anmeldung' }).waitFor()
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()

  return { browser, context, page }
}

// ---------------------------------------------------------------------------
// §16.1 items — each function drives the product surfaces of §16.2
// ---------------------------------------------------------------------------

async function item1(shared) {
  const label = itemNames[0]

  if (!shared.browserOk) {
    return shared.browserMissing ? browserSkipped(1, label) : stackSkipped(1, label)
  }

  const { page } = shared.browserSession

  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo: 'E2E-M12-01', name: 'Acceptance object one', systems: [{ type: 'BMA', label: 'E2E acceptance system' }] },
  })

  if (object.status !== 201) {
    return verdict(1, label, 'FAIL', `object not created (${object.status})`)
  }

  const token = object.data().qrToken

  if (token === null || token === undefined) {
    return verdict(1, label, 'FAIL', 'the created object carries no QR token')
  }

  await page.goto(`${webBase}/m/${token}`)
  await page.getByText('Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.').waitFor()
  await page.getByRole('button', { name: 'Leitungsunterbrechung' }).click()
  await page.locator('textarea[name="text"]').fill('Acceptance report one')
  await page.locator('input[name="contactPhone"]').fill('0000000')
  await page.getByTestId('photo-input').setInputFiles([
    { name: 'acceptance-photo-1.jpg', mimeType: 'image/jpeg', buffer: onePixelJpeg },
    { name: 'acceptance-photo-2.jpg', mimeType: 'image/jpeg', buffer: onePixelJpeg },
  ])
  await page.getByTestId('photo-preview').toHaveCount(2)
  await page.getByRole('button', { name: 'Störung melden' }).click()
  await page.getByRole('heading', { level: 1, name: 'Meldung eingegangen' }).waitFor()

  const ticketNoText = await page.getByTestId('report-ticket-no').innerText()
  const ticketNo = /ST-\d{4}-\d{4,}/.exec(ticketNoText)?.[0] ?? ''

  if (ticketNo === '') {
    return verdict(1, label, 'FAIL', 'no ticket number on the confirmation page')
  }

  const submittedAt = Date.now()

  // §16.3 (item 1 timing): the ticket in the office list within 3 s.
  await page.goto(`${webBase}/tickets`)
  let listMs = -1

  for (let attempt = 0; attempt < 10 && listMs < 0; attempt += 1) {
    try {
      await page.getByText(ticketNo).waitFor({ timeout: 400 })

      listMs = Date.now() - submittedAt
    } catch {
      // not yet visible
    }
  }

  shared.item1TicketNo = ticketNo

  // §16.2/1+10: the office notification — drain the outbox of this run and read the
  // history of the ticket.
  await drainForTicket()

  const history = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const events = history.status === 200 ? history.data().events ?? [] : []
  const photos = history.status === 200 ? history.data().photos ?? [] : []
  const notified = events.filter((event) => event.type === 'notification_sent').length
  const matrixReached = shared.mockBodies.filter((body) => body.msgtype === 'm.text').length

  const okAll =
    listMs >= 0 &&
    listMs <= 3_000 &&
    notified >= 1 &&
    photos.length === 2 &&
    matrixReached >= 1

  return verdict(
    1,
    label,
    okAll ? 'PASS' : 'FAIL',
    `office list after ${listMs} ms, ${notified} notification_sent event(s), ${photos.length} photos, ${matrixReached} fallback messages reached`,
  )
}

/** Drains the outbox with the chain env of §16.2/10 (failing signal, fallback matrix). */
async function drainForTicket() {
  return oneShot('drain outbox', `
  import { drainOutbox, type OutboxDrainResult } from '${join(apiSrc, 'notifications/outbox')}'
  import { loadEnv } from '${join(apiSrc, 'config/env')}'
  const env = loadEnv()
  const result = await drainOutbox(db, env)
  console.log(JSON.stringify(result satisfies OutboxDrainResult))
`, {
    SIGNAL_CLI_URL: 'http://127.0.0.1:1/',
    SIGNAL_SOURCE_NUMBER: '+491234567890',
    SIGNAL_RECIPIENTS: '+491234567891',
    MATRIX_HOMESERVER: `http://127.0.0.1:${mockPort}`,
    MATRIX_ROOM_ID: '!acceptance:e2e.invalid',
    MATRIX_ACCESS_TOKEN: 'e2e-only-matrix-token',
  })
}

async function item2(shared) {
  const label = itemNames[1]

  if (!shared.browserOk) {
    return shared.browserMissing ? browserSkipped(2, label) : stackSkipped(2, label)
  }

  const { page } = shared.browserSession

  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo: 'E2E-M12-02', name: 'Acceptance object two', systems: [{ type: 'BMA', label: 'E2E acceptance system' }] },
  })

  if (object.status !== 201) {
    return verdict(2, label, 'FAIL', `object not created (${object.status})`)
  }

  const token = object.data().qrToken

  await page.goto(`${webBase}/m/${token}`)
  await page.getByText('Bei Brand oder Gefahr: Notruf 112. dieses Formular ersetzt keinen Notruf.'.replace('diese', 'Dieses')).waitFor()
  await page.getByRole('button', { name: 'Leitungsunterbrechung' }).click()
  await page.locator('textarea[name="text"]').fill('Acceptance flight-mode report')
  await page.locator('input[name="contactPhone"]').fill('0000000')

  // §16.2/2: the flight mode of WP-M2-09b — offline, the report stays in the outbox.
  await page.context().setOffline(true)

  const capturedAt = Date.now()

  await page.getByRole('button', { name: 'Störung melden' }).click()
  await page.getByText('1 wartet').waitFor()

  const openCount = async () => {
    const open = await apiRequest('GET', `/api/v1/public/tickets/open?qrToken=${token}`)

    return open.status === 200 ? open.data().tickets?.length ?? -1 : -1
  }

  const whileOffline = await openCount()

  // Back online: the outbox replays — exactly one ticket, never a duplicate.
  await page.context().setOffline(false)
  const backOnlineAt = Date.now()

  let count = -1

  for (let attempt = 0; attempt < 15 && count !== 1; attempt += 1) {
    await sleep(1_000)
    count = await openCount()
  }

  const open = await apiRequest('GET', `/api/v1/public/tickets/open?qrToken=${token}`)
  const reportedAt = open.status === 200 ? open.data().tickets?.[0]?.reportedAt ?? '' : ''
  const reportedMs = Date.parse(reportedAt)

  // §16.3 (item 1 timing analogue): `reported_at` is the capture time, not the replay.
  const captureOk =
    !Number.isNaN(reportedMs) &&
    reportedMs <= backOnlineAt &&
    Math.abs(reportedMs - capturedAt) <= 60_000

  const okAll = whileOffline === 0 && count === 1 && captureOk

  return verdict(
    2,
    label,
    okAll ? 'PASS' : 'FAIL',
    `0 tickets while offline (${whileOffline}), ${count} ticket back online, reported_at ${reportedAt} vs capture ${new Date(capturedAt).toISOString()}`,
  )
}

async function item3(shared) {
  const label = itemNames[2]

  if (!shared.ok) {
    return stackSkipped(3, label)
  }

  const prepared = await prepareOfferedTicket(shared, 'E2E-M12-03', 'Acceptance object three')

  if (prepared === null) {
    return verdict(3, label, 'FAIL', 'fixture ticket could not be offered')
  }

  const ticketNo = prepared

  // §16.2/3: two technicians claim the same offer — the API answers through
  // `workflow.ts`: exactly one wins, the loser sees the transition conflict.
  const claims = await Promise.all([
    apiRequest('POST', `/api/v1/tickets/${ticketNo}/claim`, { cookie: shared.adminCookie }),
    apiRequest('POST', `/api/v1/tickets/${ticketNo}/claim`, { cookie: shared.techCookie }),
  ])

  const wins = claims.filter((claim) => claim.status === 200)
  const conflicts = claims.filter((claim) => claim.status === 409 && claim.data().code === 'invalid_transition')

  const detail = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const body = detail.status === 200 ? detail.data() : null
  const assigned = body?.ticket?.status === 'ASSIGNED'

  const okAll = wins.length === 1 && conflicts.length === 1 && assigned

  return verdict(
    3,
    label,
    okAll ? 'PASS' : 'FAIL',
    `one 200 / one 409 invalid_transition (${wins.length}/${conflicts.length}), ticket ${ticketNo} ASSIGNED`,
  )
}

/** Creates an internal ticket and moves it to OFFERED (the offer path of §16.2/3+12). */
async function prepareOfferedTicket(shared, objectNo, objectName) {
  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo, name: objectName, systems: [{ type: 'BMA', label: 'E2E acceptance system' }] },
  })

  if (object.status !== 201) {
    return null
  }

  const ticket = await apiRequest('POST', '/api/v1/tickets', {
    cookie: shared.adminCookie,
    json: {
      objectId: object.data().id,
      title: 'Acceptance workflow ticket',
      description: 'Acceptance suite fixture',
      priority: 'normal',
    },
  })

  if (ticket.status !== 201) {
    return null
  }

  const ticketNo = ticket.data().ticketNo

  const steps = [
    ['review', {}],
    ['work-order', { type: 'AA', number: '4712' }],
    ['offer', { poolId: shared.staffedPoolId }],
  ]

  for (const [segment, json] of steps) {
    const moved = await apiRequest('POST', `/api/v1/tickets/${ticketNo}/${segment}`, {
      cookie: shared.adminCookie,
      json,
    })

    if (moved.status !== 200) {
      return null
    }
  }

  return ticketNo
}

async function item4(shared) {
  const label = itemNames[3]

  if (!shared.ok) {
    return stackSkipped(4, label)
  }

  const ticketNo = await prepareOfferedTicket(shared, 'E2E-M12-04', 'Acceptance object four')

  if (ticketNo === null) {
    return verdict(4, label, 'FAIL', 'the offered-ticket fixture could not be prepared')
  }

  const withoutReason = await apiRequest('POST', `/api/v1/tickets/${ticketNo}/decline`, {
    cookie: shared.adminCookie,
    json: {},
  })

  const detailAfter = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const statusAfter = detailAfter.status === 200 ? detailAfter.data().ticket?.status ?? '' : ''

  const rejected = withoutReason.status === 422 || withoutReason.status === 400
  const unchanged = statusAfter === 'OFFERED'

  // the positive path: a trimmed reason of at least 5 characters is accepted
  const withReason = await apiRequest('POST', `/api/v1/tickets/${ticketNo}/decline`, {
    cookie: shared.adminCookie,
    json: { reason: 'Not this week — acceptance suite' },
  })

  const okAll =
    rejected &&
    unchanged &&
    withoutReason.data().code === 'invalid_request' &&
    withReason.status === 200

  return verdict(
    4,
    label,
    okAll ? 'PASS' : 'FAIL',
    `decline without reason: ${withoutReason.status} ${withoutReason.data().code ?? ''}; ticket still ${statusAfter}; decline with reason: ${withReason.status}`,
  )
}

async function item5(shared) {
  const label = itemNames[4]

  if (!shared.ok) {
    return stackSkipped(5, label)
  }

  if (!shared.browserOk) {
    // the office-path rule "acknowledge without a note is impossible" (§16.3 open point)
    return shared.browserMissing
      ? browserSkipped(5, label)
      : stackSkipped(5, label)
  }

  const { page } = shared.browserSession

  // the ticket of item 1 already carries the two photos of the QR report (§16.2/5).
  const ticketNo = shared.item1TicketNo

  if (ticketNo === '') {
    return verdict(5, label, 'FAIL', 'item 1 did not create a ticket')
  }

  // office path: the detail page offers the acknowledge panel with its note field
  await page.goto(`${webBase}/tickets/${ticketNo}`)

  // (a) acknowledge without a note must be impossible on the office path
  await page.getByRole('button', { name: /Optionen|Options/ }).click()
  await page.getByRole('button', { name: 'Rückmeldung setzen' }).click()
  await page.locator('input[name="acknowledgeResult"]').fill('fixed')
  await page.getByRole('button', { name: 'Bestätigen' }).click()

  const beforeNote = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const statusBeforeNote = beforeNote.status === 200 ? beforeNote.data().ticket?.status ?? '' : ''

  // (b) with note and photo the timeline stops
  await page.locator('input[name="acknowledgeNote"]').fill('Acceptance suite note')
  await page.getByRole('button', { name: 'Bestätigen' }).click()

  const detail = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const body = detail.status === 200 ? detail.data() : null
  const timeline = body?.timeline ?? {}

  const okAll =
    statusBeforeNote !== 'ACKNOWLEDGED' &&
    body?.ticket?.status === 'ACKNOWLEDGED' &&
    (body?.photos ?? []).length === 2 &&
    timeline.stoppedAt !== null &&
    timeline.stoppedAt !== undefined

  return verdict(
    5,
    label,
    okAll ? 'PASS' : 'FAIL',
    `without note: ${statusBeforeNote} (not acknowledged); with note+photo: ${body?.ticket?.status ?? ''}, ${body?.photos?.length ?? 0} photos, timeline stoppedAt ${timeline.stoppedAt ?? 'unset'}`,
  )
}

async function item6(shared) {
  const label = itemNames[5]

  if (!shared.ok) {
    return stackSkipped(6, label)
  }

  const hours = await apiRequest('GET', '/api/v1/settings/deadlines', { cookie: shared.adminCookie })
  const configured = hours.status === 200 ? hours.data().hours ?? {} : {}
  const normalHours = Number(configured.normal ?? 0)

  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo: 'E2E-M12-06', name: 'Acceptance object six' },
  })

  if (object.status !== 201) {
    return verdict(6, label, 'FAIL', `object not created (${object.status})`)
  }

  const objectId = object.data().id

  // §16.2/6: an unclaimed NEW ticket whose configured deadline has passed
  // (the phase-6 exit pattern) — the scan of `tickets/escalation.ts`.
  const seeded = oneShot('overdue ticket', `
  const reported = new Date(Date.now() - (${normalHours} + 4) * 60 * 60 * 1000)
  const deadline = new Date(reported.getTime() + ${normalHours} * 60 * 60 * 1000)
  const [row] = await db.insert(schema.tickets).values({
    objectId: '${objectId}',
    status: 'NEW',
    priority: 'normal',
    source: 'INTERNAL',
    reportedAt: reported,
    receivedAt: reported,
    deadlineAt: deadline,
  }).returning({ ticketNo: schema.tickets.ticketNo })
  console.log(JSON.stringify({ ticketNo: row?.ticketNo ?? '' }))
`)

  if (!seeded.ok) {
    return verdict(6, label, 'FAIL', 'the overdue fixture could not be inserted')
  }

  const ticketNo = String(seeded.data.ticketNo ?? '')

  const scanned = oneShot('escalation scan', `
  import { evaluateEscalations } from '${join(apiSrc, 'tickets/escalation')}'
  const result = await evaluateEscalations(db)
  console.log(JSON.stringify(result))
`)

  if (!scanned.ok) {
    return verdict(6, label, 'FAIL', 'the escalation scan failed')
  }

  const detail = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const events = detail.status === 200 ? detail.data().events ?? [] : []
  const escalated = events.filter(
    (event) => event.type === 'escalated' && (event.payload?.rule ?? '') === 'deadline_exceeded',
  )

  const okAll =
    scanned.ok &&
    Number(scanned.data.scanned ?? 0) > 0 &&
    escalated.length === 1 &&
    detail.status === 200

  return verdict(
    6,
    label,
    okAll ? 'PASS' : 'FAIL',
    `configured deadline for normal: ${normalHours} h; scan scanned ${scanned.data?.scanned}, ${escalated.length} deadline_exceeded event(s) in the history of ${ticketNo}`,
  )
}

async function item7(shared) {
  const label = itemNames[6]

  if (!shared.ok) {
    return stackSkipped(7, label)
  }

  const key = await apiRequest('POST', '/api/v1/api-keys', {
    cookie: shared.adminCookie,
    json: { name: 'acceptance-suite', scopes: ['objects:read', 'objects:write'] },
  })

  if (key.status !== 201) {
    return verdict(7, label, 'FAIL', `no API key (${key.status})`)
  }

  const bearer = key.data().token

  const upsert = await apiRequest('PUT', '/api/v1/objects/E2E-M12-07', {
    bearer,
    json: { name: 'Acceptance object seven' },
  })
  const update = await apiRequest('PUT', '/api/v1/objects/E2E-M12-07', {
    bearer,
    json: { name: 'Acceptance object seven renamed' },
  })
  const deactivate = await apiRequest('DELETE', '/api/v1/objects/E2E-M12-07', { bearer })
  const after = await apiRequest('GET', '/api/v1/objects/E2E-M12-07', { bearer })

  const invalid = await apiRequest('PUT', '/api/v1/objects/E2E-M12-07-invalid', {
    bearer,
    json: { name: '' },
  })
  const taken = await apiRequest('PUT', '/api/v1/objects/E2E-M12-07', { bearer, json: { name: 'taken?' } })

  void taken

  const createdAgain = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo: 'E2E-M12-07', name: 'duplicate acceptance object' },
  })

  const invalidBody = invalid.status === 422 ? invalid.data() : {}
  const fields = invalidBody?.params?.fields ?? []

  const okAll =
    upsert.status === 201 &&
    update.status === 200 &&
    deactivate.status === 204 &&
    after.status === 200 &&
    after.data().active === false &&
    invalid.status === 422 &&
    fields.length >= 1 &&
    createdAgain.status === 422 &&
    createdAgain.data().code === 'object_no_taken'

  return verdict(
    7,
    label,
    okAll ? 'PASS' : 'FAIL',
    `upsert ${upsert.status}/update ${update.status}/deactivate ${deactivate.status} (active false), invalid ${invalid.status} fields ${fields.join(',')}, taken ${createdAgain.status} ${createdAgain.data().code ?? ''}`,
  )
}

async function item8(shared) {
  const label = itemNames[7]

  if (!shared.ok || shared.statsRef === null) {
    return stackSkipped(8, label)
  }

  const reference = shared.statsRef.lastQualifying

  const first = await apiRequest('GET', '/api/v1/dashboard', { cookie: shared.adminCookie })
  const sinceBefore = first.status === 200 ? first.data().faultFree?.since ?? '' : ''

  // §16.2/8: a new qualifying report resets the counter.
  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo: 'E2E-M12-08', name: 'Acceptance object eight' },
  })

  if (object.status !== 201) {
    return verdict(8, label, 'FAIL', `object not created (${object.status})`)
  }

  const report = await apiRequest('POST', '/api/v1/public/tickets', {
    json: {
      qrToken: object.data().qrToken,
      clientUuid: '22222222-2222-4222-8222-222222222201',
      text: 'Acceptance counter reset report',
      contact: { phone: '0000000' },
      locale: 'de',
    },
  })

  if (report.status !== 201) {
    return verdict(8, label, 'FAIL', `new report not created (${report.status})`)
  }

  const reportedAt = report.data().reportedAt

  const second = await apiRequest('GET', '/api/v1/dashboard', { cookie: shared.adminCookie })
  const sinceAfter = second.status === 200 ? second.data().faultFree?.since ?? '' : ''

  // §16.2/8: a test ticket (`tickets.is_test` of WP-M9-02) never resets the counter.
  const testRow = oneShot('test ticket', `
  const [objectRow] = await db.select({ id: schema.objects.id }).from(schema.objects)
    .where(eq(schema.objects.objectNo, 'STATS-REF')).limit(1)
  const [row] = await db.insert(schema.tickets).values({
    objectId: objectRow?.id ?? '',
    clientUuid: '22222222-2222-4222-8222-222222222202',
    status: 'NEW',
    priority: 'normal',
    source: 'QR',
    reportedAt: new Date(),
    receivedAt: new Date(),
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
    isTest: true,
  }).returning({ id: schema.tickets.id })
  console.log(JSON.stringify({ inserted: row !== undefined }))
`)

  const third = await apiRequest('GET', '/api/v1/dashboard', { cookie: shared.adminCookie })
  const sinceTest = third.status === 200 ? third.data().faultFree?.since ?? '' : ''

  const okAll =
    sinceAfter === reportedAt &&
    sinceTest === reportedAt &&
    testRow.ok &&
    testRow.data.inserted === true

  return verdict(
    8,
    label,
    okAll ? 'PASS' : 'FAIL',
    `counter before: ${sinceBefore} (reference ${reference} — is_test and cancelled excluded), reset to ${sinceAfter}, test ticket ${testRow.data?.inserted ?? false} keeps ${sinceTest}`,
  )
}

async function item9(shared) {
  const label = itemNames[8]

  if (!shared.ok || shared.statsRef === null) {
    return stackSkipped(9, label)
  }

  const stats = await apiRequest('GET', '/api/v1/stats/reaction-times?from=2026-01-01&to=2026-01-07', {
    cookie: shared.adminCookie,
  })

  const review = stats.status === 200 ? stats.data().review ?? {} : {}
  const expected = shared.statsRef

  const okAll = review.count === 5 && review.medianMinutes === expected.median

  return verdict(
    9,
    label,
    okAll ? 'PASS' : 'FAIL',
    `seeded reference ${expected.median} min over ${review.count} review(s), API median ${review.medianMinutes} min`,
  )
}

async function item10(shared) {
  const label = itemNames[9]

  if (!shared.ok) {
    return stackSkipped(10, label)
  }

  // §16.2/10: one ticket whose only configured channel at report time fails
  // (the WP-M7-05 pattern): enqueue signal only, drain signal + matrix fallback.
  const fixture = oneShot('notification fixture', `
  import { enqueueOutbox, type OutboxTicket } from '${join(apiSrc, 'notifications/outbox')}'
  import { loadEnv } from '${join(apiSrc, 'config/env')}'
  const [objectRow] = await db.select({ id: schema.objects.id, name: schema.objects.name })
    .from(schema.objects).where(eq(schema.objects.objectNo, 'E2E-M12-08')).limit(1)
  const [ticket] = await db.insert(schema.tickets).values({
    objectId: objectRow?.id ?? '',
    clientUuid: '33333333-3333-4333-8333-333333333301',
    status: 'NEW',
    priority: 'normal',
    source: 'QR',
    reportedAt: new Date(),
    receivedAt: new Date(),
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning({ id: schema.tickets.id, ticketNo: schema.tickets.ticketNo })
  await db.insert(schema.ticketEvents).values({
    ticketId: ticket?.id ?? '',
    type: 'created',
    actorKind: 'public',
    payload: { source: 'QR' },
  })
  const queued = await enqueueOutbox(db, {
    id: ticket?.id ?? '',
    ticketNo: ticket?.ticketNo ?? '',
    priority: 'normal',
    objectName: objectRow?.name ?? '',
  } satisfies OutboxTicket, loadEnv())
  console.log(JSON.stringify({ ticketId: ticket?.id ?? '', ticketNo: ticket?.ticketNo ?? '', queued }))
`, {
    // at report time only the failing signal bridge is configured (§16.2/10)
    MATRIX_HOMESERVER: '',
    MATRIX_ROOM_ID: '',
    MATRIX_ACCESS_TOKEN: '',
  })

  if (!fixture.ok) {
    return verdict(10, label, 'FAIL', 'the notification fixture could be queued')
  }

  const ticketNo = String(fixture.data.ticketNo ?? '')

  // §16.2/10: the scheduled drain of the running stack (pg-boss, WP-M7-04c) delivers the
  // outbox rows of the fixture — the suite drives the stack, it does not call the service.
  let drained = { ok: false }
  let rowList = []

  for (let attempt = 0; attempt < 24 && !drained.ok; attempt += 1) {
    await sleep(5_000)

    const rowsProbe = oneShot('outbox rows', `
  const rows = await db.select({ channel: schema.outbox.channel, state: schema.outbox.state, attempts: schema.outbox.attempts })
    .from(schema.outbox).where(eq(schema.outbox.ticketId, '${fixture.data.ticketId}'))
  console.log(JSON.stringify(rows))
`)

    if (rowsProbe.ok) {
      rowList = rowsProbe.data

      const signalDone = rowList.some((row) => row.channel === 'signal' && row.state === 'FAILED')
      const matrixDone = rowList.some((row) => row.channel === 'matrix' && row.state === 'SENT')

      drained = { ok: signalDone && matrixDone }
    }
  }

  const detail = await apiRequest('GET', `/api/v1/tickets/${ticketNo}`, { cookie: shared.adminCookie })
  const events = detail.status === 200 ? detail.data().events ?? [] : []
  const failed = events.filter(
    (event) => event.type === 'notification_failed' && (event.payload?.channel ?? '') === 'signal',
  )
  const sent = events.filter(
    (event) => event.type === 'notification_sent' && (event.payload?.channel ?? '') === 'matrix',
  )

  const dashboard = await apiRequest('GET', '/api/v1/dashboard', { cookie: shared.adminCookie })
  const channels = dashboard.status === 200 ? dashboard.data().tiles?.channels ?? [] : []
  const signalTile = channels.find((tile) => tile.name === 'signal') ?? {}
  const matrixTile = channels.find((tile) => tile.name === 'matrix') ?? {}

  const matrixReached = shared.mockBodies.filter((body) => body.msgtype === 'm.text').length
  const signalRow = rowList.find((row) => row.channel === 'signal') ?? {}
  const matrixRow = rowList.find((row) => row.channel === 'matrix') ?? {}

  const okAll =
    fixture.data.queued === 1 &&
    drained.ok &&
    signalRow.state === 'FAILED' &&
    Number(signalRow.attempts ?? 0) === 3 &&
    matrixRow.state === 'SENT' &&
    failed.length === 1 &&
    sent.length === 1 &&
    Number(signalTile.failed ?? 0) >= 1 &&
    matrixTile.lastSentAt !== undefined &&
    matrixReached >= 1

  return verdict(
    10,
    label,
    okAll ? 'PASS' : 'FAIL',
    `drain ${JSON.stringify(drained.data ?? {})}; rows ${JSON.stringify(rowList)}; signal FAILED x3, matrix SENT; history ${failed.length} notification_failed + ${sent.length} notification_sent; events ${JSON.stringify(events.slice(-4))}; dashboard ${JSON.stringify({ signal: signalTile, matrix: matrixTile })}; ${matrixReached} fallback messages reached`,
  )
}

async function item11(shared) {
  const label = itemNames[10]

  if (!shared.ok) {
    return verdict(11, label, 'UNVERIFIED', 'the running stack did not answer (see the notices)')
  }

  // §16.2/11: the delivery side of the web-push channel — the adapter reads the
  // `push_subscriptions` rows and builds the VAPID-signed request (ADR-0010).
  const delivered = oneShot('web-push delivery side', `
  import { sendWebPushNotification, type WebPushConfig, type NotificationMessage, type WebPushSubscription } from '${join(apiSrc, 'notifications/channels/web-push')}'
  const rows = await db.select({
    endpoint: schema.pushSubscriptions.endpoint,
    p256dh: schema.pushSubscriptions.p256dh,
    auth: schema.pushSubscriptions.auth,
  }).from(schema.pushSubscriptions)
  let subscriptions = rows.map((row) => ({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))

  if (subscriptions.length === 0) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
    const inserted = await db.insert(schema.pushSubscriptions).values({
      userId: user?.id ?? '',
      endpoint: 'https://push.e2e.invalid/acceptance',
      p256dh: 'BPm1e2ep256dhKeyForTheAcceptanceSuiteFixtureAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      auth: 'e2eOnlyAuthKey',
    }).returning()
    const [row] = inserted
    subscriptions = row === undefined ? [] : [{ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }]
  }

  const captured = []
  const config = {
    publicKey: 'BPm1NEFHt4bH8m8mV0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ0mQ',
    privateKey: 'fMy7e2eOnlyPrivateKeyNotARealSecretAAAAAAAAAAAAAAAAAAAAAAA',
    subject: 'mailto:acceptance@e2e.invalid',
  }

  await sendWebPushNotification(
    config satisfies WebPushConfig,
    { title: 'ST-E2E-0001', body: 'normal · Acceptance object' } satisfies NotificationMessage,
    '${webBase}',
    subscriptions satisfies WebPushSubscription[],
    (subscription, payload, details) => {
      captured.push({ endpoint: subscription.endpoint, payload, subject: details.vapidDetails.subject })
    },
  )

  console.log(JSON.stringify({ sent: captured.length, endpointOk: captured.some((row) => row.endpoint.startsWith('https://push.e2e.invalid/')), payloadOk: captured.some((row) => row.payload.includes('ST-E2E-0001') && row.payload.includes('Acceptance object') && row.payload.includes('${webBase}')), subjectOk: captured.some((row) => row.subject === 'mailto:acceptance@e2e.invalid') }))
`)

  const note =
    `channel side verified (${JSON.stringify(delivered.data ?? { sent: 0 })}); ` +
    'the web app has no push-subscription registration (work-packages backlog), ' +
    'so §16.1/11 is unverified by design — never PASS'

  return verdict(11, label, 'UNVERIFIED', note)
}

async function item12(shared) {
  const label = itemNames[11]

  if (!shared.ok) {
    return stackSkipped(12, label)
  }

  // on-call settings of the phase-8 exit pattern (approval off for the atomic swap)
  const settings = await apiRequest('PUT', '/api/v1/settings/oncall', {
    cookie: shared.adminCookie,
    json: {
      'oncall.week_start_weekday': 1,
      'oncall.start_time': '07:00',
      'oncall.duration_days': 7,
      'oncall.swap_requires_admin_approval': false,
    },
  })

  if (settings.status !== 200) {
    return verdict(12, label, 'FAIL', `on-call settings not written (${settings.status})`)
  }

  // §16.2/12: DST slot calculation through the API (`generateOncallSlots`).
  const dstPool = await apiRequest('POST', '/api/v1/oncall/pools', {
    cookie: shared.adminCookie,
    json: { name: 'Acceptance DST pool' },
  })

  if (dstPool.status !== 201) {
    return verdict(12, label, 'FAIL', `DST pool not created (${dstPool.status})`)
  }

  const dstPoolId = dstPool.data().id

  const windows = [
    { from: '2026-11-02T00:00:00.000Z', to: '2026-11-09T06:00:00.000Z', hours: 168 },
    { from: '2026-03-23T00:00:00.000Z', to: '2026-03-30T05:00:00.000Z', hours: 167 },
    { from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T06:00:00.000Z', hours: 169 },
  ]

  const durations = []

  for (const window of windows) {
    const generated = await apiRequest('POST', '/api/v1/oncall/shifts/generate', {
      cookie: shared.adminCookie,
      json: { poolId: dstPoolId, from: window.from, to: window.to },
    })

    const list = await apiRequest(
      'GET',
      `/api/v1/oncall/shifts?poolId=${dstPoolId}&from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`,
      { cookie: shared.adminCookie },
    )

    const shifts = list.status === 200 ? list.data().shifts ?? [] : []
    const hours = shifts.map((shift) => (Date.parse(shift.endsAt) - Date.parse(shift.startsAt)) / 3_600_000)

    durations.push(generated.status === 200 && hours.includes(window.hours))
  }

  // §16.2/12: decline without a reason is rejected (`oncall_decline_reason_required`)
  const shift = await apiRequest('POST', '/api/v1/oncall/shifts', {
    cookie: shared.adminCookie,
    json: { poolId: dstPoolId, userId: shared.techId, publish: true },
  })

  const shiftId = shift.status === 201 ? shift.data().id : ''

  const declined = await apiRequest('POST', `/api/v1/oncall/shifts/${shiftId}/decline`, {
    cookie: shared.techCookie,
    json: {},
  })

  const declineRejected =
    (declined.status === 422 || declined.status === 400) && declined.data().code === 'oncall_decline_reason_required'

  // §16.2/12: the atomic swap — exactly one acceptance wins (WP-M8-08)
  const swap = await apiRequest('POST', `/api/v1/oncall/shifts/${shared.staffedShiftId}/swap`, {
    cookie: shared.techCookie,
    json: {},
  })

  const swapId = swap.status === 201 ? swap.data().swap?.id ?? swap.data().id : ''

  const accepts = await Promise.all([
    apiRequest('POST', `/api/v1/oncall/swaps/${swapId}/accept`, {
      cookie: (await createTechnicianWithAdmin(shared.adminCookie, 'tech-b@e2e.invalid', 'e2e-only-tech-password-b-1')).cookie,
      json: {},
    }),
    apiRequest('POST', `/api/v1/oncall/swaps/${swapId}/accept`, {
      cookie: (await createTechnicianWithAdmin(shared.adminCookie, 'tech-c@e2e.invalid', 'e2e-only-tech-password-c-1')).cookie,
      json: {},
    }),
  ])

  const winner = accepts.filter((accept) => accept.status === 200)
  const loser = accepts.filter((accept) => accept.status === 409)

  const shiftAfter = await apiRequest('GET', `/api/v1/oncall/shifts/${shared.staffedShiftId}`, {
    cookie: shared.adminCookie,
  })

  const winnerUser = winner.length === 1 ? winner[0].data().swap?.acceptedByUserId ?? '' : ''

  const swapOk =
    swapId !== '' &&
    winner.length === 1 &&
    loser.length === 1 &&
    ['swap_taken', 'swap_not_pending'].includes(loser[0].data().code ?? '') &&
    shiftAfter.status === 200 &&
    shiftAfter.data().userId === winnerUser &&
    shiftAfter.data().state === 'CONFIRMED'

  // §16.2/12: the unstaffed warning kind of the on-call-first offer (WP-M8-10/11)
  const offeredTicket = await prepareOfferedTicket2(shared, 'E2E-M12-12', 'Acceptance object twelve')

  const offer = offeredTicket === '' ? { status: 0 } : await apiRequest('POST', `/api/v1/tickets/${offeredTicket}/offer`, {
    cookie: shared.adminCookie,
    json: { poolId: dstPoolId },
  })

  const unstaffedOk = offer.status === 200 && (offer.data().warning ?? '') === 'oncall_unstaffed'

  const okAll =
    durations.every(Boolean) && declineRejected && swapOk && unstaffedOk

  return verdict(
    12,
    label,
    okAll ? 'PASS' : 'FAIL',
    `DST weeks ${JSON.stringify(durations)}, decline without reason ${declined.status} ${declined.data().code ?? ''}, swap ${swapId === '' ? 'none' : swap.status} accepted ${JSON.stringify(accepts.map((a) => a.status + ' ' + (a.data().code ?? '')))}, after swap ${shiftAfter.status} userId ${shiftAfter.data().userId ?? ''} state ${shiftAfter.data().state ?? ''} winner ${winnerUser}, unstaffed offer ${offer.status} warning ${offer.data().warning ?? 'none'}`,
  )
}

/** Offer a fresh internal ticket (the unstaffed pool) for §16.2/12. */
async function prepareOfferedTicket2(shared, objectNo, objectName) {
  const object = await apiRequest('POST', '/api/v1/objects', {
    cookie: shared.adminCookie,
    json: { objectNo, name: objectName },
  })

  if (object.status !== 201) {
    return ''
  }

  const ticket = await apiRequest('POST', '/api/v1/tickets', {
    cookie: shared.adminCookie,
    json: {
      objectId: object.data().id,
      title: 'Acceptance on-call ticket',
      description: 'Acceptance suite fixture',
      priority: 'normal',
    },
  })

  if (ticket.status !== 201) {
    return ''
  }

  const ticketNo = ticket.data().ticketNo

  for (const [segment, json] of [['review', {}], ['work-order', { type: 'AA', number: '12' }]]) {
    const moved = await apiRequest('POST', `/api/v1/tickets/${ticketNo}/${segment}`, {
      cookie: shared.adminCookie,
      json,
    })

    if (moved.status !== 200) {
      return ''
    }
  }

  return ticketNo
}

await main().catch((error) => {
  notice(`FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
