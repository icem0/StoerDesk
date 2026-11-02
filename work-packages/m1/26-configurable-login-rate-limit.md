# WP-M1-26: configurable login rate limit (retroactive record)

format: small-model
status: done (retroactive record — implemented in commits 4da1c7b and ad0b45b,
2026-11-02, without a WP; `.env.example` closed by this record commit)
depends-on: WP-M1-07b, WP-M1-12
phase: 1
context-budget: 14k tokens
spec: PLAN.md §15 (rate limits on login), specs/01-rbac.md §3.6 (session and `me`)
spec-lines: 20

files-read:

- apps/api/src/auth/routes.ts
- apps/api/src/config/env.ts
- apps/web/playwright.config.ts
- scripts/e2e-check.mjs

files-write:

- apps/api/src/auth/routes.ts
- apps/api/src/config/env.ts
- apps/web/playwright.config.ts
- .env.example

interfaces:

- `LOGIN_RATE_LIMIT_MAX` (default `5`) and `LOGIN_RATE_LIMIT_WINDOW` (default
  `1 minute`) in the API environment schema
- `loginRateLimit(env)` replaces the hard-coded `LOGIN_RATE_LIMIT` constant of the
  login route
- the E2E API is started with `LOGIN_RATE_LIMIT_MAX=999999`

## Task

This document does **not** describe new implementation work. It records two commits
that landed without a work package, and closes the one gap they left.

1. `4da1c7b` — the phase 2 exit-criterion E2E (`WP-M2-10`) signs in several times in a
   row and tripped the hard-coded `5` logins per minute and IP of WP-M1-07b: the suite
   failed with `rate_limited`.
2. `ad0b45b` — moved the value into the environment instead of patching the test
   around it: the login route reads `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW`,
   the production default stays `5` per minute, and the throwaway E2E API raises the
   limit in `apps/web/playwright.config.ts`.
3. This record adds the two keys to `.env.example`, which `PLAN.md` §15 requires to be
   complete; they were missing there.

## Non-goals

- No change to the production default (`5` per minute per IP) — the hardening rule of
  `PLAN.md` §15 stays.
- No change to the general `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` pair.
- No new rate limit store — the limiter stays the in-memory `@fastify/rate-limit`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run test:e2e
```

Expected: green; the E2E suites (auth, report form, phase 2 flow) sign in repeatedly
without `rate_limited`, while a default API still answers `429 rate_limited` after five
logins per minute and IP.

## Handoff

- Files changed: `apps/api/src/auth/routes.ts`, `apps/api/src/config/env.ts`,
  `apps/web/playwright.config.ts`, `.env.example` (the last one added by this record)
- Interfaces added: `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW`
- Verified: `npm run check` green in this commit; `npm run test:e2e` is unverified in
  this container (no reachable browser/database — `PLAN.md` §18.2), it is verified by
  the CI `check` run
- Deviation: two commits, no WP; `4da1c7b` is a phase 2 commit fixing a phase 1
  limitation — it is recorded here because the login rate limit is WP-M1-07b's contract
- Follow-up WP: none
- Open question: none
