# WP-M1-12: Playwright smoke test "login as admin works"

format: small-model
status: done
depends-on: WP-M1-09e, WP-M1-11
phase: 1
context-budget: 28k tokens
spec: PLAN.md §16 (phase 1 exit criteria "login as admin works") and §18;
`specs/16-acceptance.md` is still a placeholder, so `PLAN.md` stays authoritative
spec-lines: 0

files-read:

- apps/web/src/auth/login-form.tsx
- apps/web/src/admin/users-page.tsx
- apps/api/src/db/seed-base.ts
- apps/api/src/db/\_\_tests\_\_/helpers/testDatabase.ts
- apps/web/vite.config.ts
- .github/workflows/check.yml

files-write:

- apps/web/e2e/auth.spec.ts
- apps/web/playwright.config.ts
- scripts/e2e-check.mjs
- apps/web/src/i18n/index.ts

interfaces:

- `npm run test:e2e` → `node scripts/e2e-check.mjs`, and it is the last gate of
  `npm run check`. Without a reachable Postgres or without an installed Chromium the
  runner prints one notice and exits `0` — the same skip rule the API integration tests
  use (`AGENTS.md` _Database and tests_), so `npm run check` stays green without a setup.
- throwaway database: created from `TEST_DATABASE_URL` (fallback `DATABASE_URL`) as
  `stoerdesk_e2e_<base36>`, migrated (`src/db/migrate.ts`), seeded (`seed-rbac.ts`,
  then `seed-base.ts` with `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`), dropped after the
  run. If `CREATE DATABASE` is not allowed the run skips — the E2E never writes into a
  shared database.
- Playwright env contract: `E2E_DATABASE_URL`, `E2E_API_PORT` (default 3174),
  `E2E_WEB_PORT` (default 5174), `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` and
  `E2E_CHROMIUM_PATH` (distribution browser for containers whose bundled build cannot
  start, e.g. Alpine/musl — it points the Playwright launcher at `/usr/bin/chromium`
  instead of the glibc build).
- Missing prerequisites produce one skip notice instead of a red gate locally; in CI
  (`CI=true`) they are an error — that job installs the bundled browser anyway.
- `playwright.config.ts` `webServer`: API (`npm run start -w @stoerdesk/api`) plus the
  Vite **dev** server (`npm run dev -w @stoerdesk/web -- --port …`), because only the dev
  server proxies `/api` to `API_PORT`; `nginx` proxying exists only in the image, which
  `scripts/docker-smoke.sh` covers.
- `apps/web/src/i18n/index.ts`: initial language is the stored `i18nextLng` preference
  when it is a supported locale, otherwise `de` — without it the `en` bundle is never
  reachable in a running app and an EN test cannot exist.

## Task

Phase 1 ends with the exit criterion "login as admin works". WP-M1-09e made it reachable
by hand; this package asserts it end to end in a real browser against a real database.

1. `scripts/e2e-check.mjs`: probe `TEST_DATABASE_URL` (fallback `DATABASE_URL`) and the
   installed Chromium, create the throwaway database, run migrations and both seeds
   against it, run Playwright with the env contract above, drop the database again.
   Missing prerequisites produce one skip notice instead of a red gate.
2. `apps/web/playwright.config.ts`: one Chromium project, `baseURL` of the Vite dev
   server, both `webServer` entries with `reuseExistingServer` off in CI, and the API
   pointed at the throwaway database.
3. `apps/web/e2e/auth.spec.ts`: two tests (DE, EN). Each opens `/`, fills the login form
   of the seeded bootstrap administrator, submits, and asserts the signed-in shell
   (`auth.signedInAs`), `GET /api/v1/me` answering role `admin` plus `user.read`, the
   `/admin/users` heading and the seeded row with its role cell — all texts through the
   de/en locale files, never hard-coded expectations that bypass i18n.
4. `apps/web/src/i18n/index.ts`: read the stored language preference (see interfaces).

## Non-goals

- No new product feature beyond the stored-language read: no language switcher UI, no
  browser-language detection (that stays phase 2 UI work in `specs/13-ui.md`).
- No new API, schema, migration or seed change; the seeds are only executed.
- No new CI job: the E2E runs inside the existing `check` job, which already provides the
  Postgres-16 service, so the publish chain and its `needs` list stay untouched.
- No Docker-based E2E — that path is `scripts/docker-smoke.sh` (WP-M0-04).

## Acceptance

```bash
npm run test:e2e   # two tests green against a throwaway database
npm run check      # E2E is the last gate, green incl. typecheck of e2e/ + config
```

Expected: two tests green locally; in CI the `e2e` steps of the `check` job are green;
without a database or without Chromium a single notice and a green gate.

## Handoff

- Files changed: the four `files-write` entries plus the wiring and bookkeeping outside
  them (`package.json` scripts `test:e2e` and `check`, `apps/web/tsconfig.json` include
  for the typecheck of `e2e/` and `playwright.config.ts`, `.github/workflows/check.yml`
  browser install, `work-packages/README.md`, `PLAN.md` §16, `AGENTS.md`,
  `docs/REPO-MAP.md`, `CHANGELOG.md`, this document)
- Interfaces added: `npm run test:e2e`, the Playwright env contract and the stored
  language preference (`i18nextLng`) — the latter is what a later language switcher UI
  will write
- Verified: `npm run check` green locally with the two E2E tests actually executed
  (throwaway database created, migrated, seeded, dropped) — locally via
  `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`, because this dev container is
  Alpine/musl and the bundled Playwright Chromium (a glibc build) cannot start there;
  without a usable browser the runner prints one skip notice and exits 0.
- Deviation: the legacy WP document was rewritten into the small-model format before
  implementation, and the ten-line stored-language read was added because the acceptance
  requires an EN test while the app had no path to the `en` bundle; the runner additionally
  probes the browser before any server or database is prepared and skips on musl containers
  instead of failing red, with `E2E_CHROMIUM_PATH` as an escape hatch for local verification.
- Follow-up WP: none — phase 1 backlog is closed, phase 2 starts with WP-M2-00
- Open question: none
