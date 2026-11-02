# WP-M1-25: CI database tests and the publish queue (retroactive record)

format: small-model
status: done (retroactive record — implemented in commits f0e0fcc, 1d56aad and d994911,
2026-10-29 … 2026-11-01, without a WP)
depends-on: WP-M1-01, WP-M0-05
phase: 1
context-budget: 16k tokens
spec: PLAN.md §18.1 (the `check` gate), §18.2 (integration tests need
`TEST_DATABASE_URL`), §18.3 (publish chain and `latest`)
spec-lines: 40

files-read:

- .github/workflows/check.yml
- .github/workflows/build.yml
- scripts/e2e-check.mjs
- docs/REPO-MAP.md

files-write:

- .github/workflows/check.yml
- .github/workflows/build.yml

interfaces:

- the `check` job provides a `postgres:16-alpine` service and passes
  `TEST_DATABASE_URL` into `npm run check`, so the API integration tests and the
  throwaway-database E2E really run in CI instead of skipping
- the publish runs of `build.yml` queue behind each other through one concurrency
  group (replaced by WP-M1-18)

## Task

This document does **not** describe new work. It records three CI commits that landed
without a work package, so that no phase 1 commit is left without a record.

1. `f0e0fcc` — the `check` job gained the PostgreSQL 16 service plus
   `TEST_DATABASE_URL`. Before it the database integration tests were skipped in CI and
   the green run verified nothing (the rule of `PLAN.md` §18.2: a skipped gate is
   unverified, never green).
2. `1d56aad` — the standalone `Playwright (E2E)` job was removed: it duplicated the
   gate, because `npm run test:e2e` is the last gate of `npm run check` (WP-M1-12). The
   same commit moved `build.yml` into one global concurrency group `publish-queue`, so
   parallel image builds could no longer leave `latest` on an older manifest.
3. `d994911` — `latest` was written by every publish run instead of only by runs
   dispatched from a green `check` run.

## Non-goals

- No change to what the gates run — only where they run.
- No new workflow, no new trigger — the tag trigger is WP-M1-10h.

## Acceptance

The acceptance of the original commits, as it is gated today:

```bash
npm run check
```

plus, in CI, the `check` run of the version tag with its job
`Quality gates (typecheck, lint, tests, i18n, wp, e2e)` against the Postgres service.

## Handoff

- Files changed: `.github/workflows/check.yml`, `.github/workflows/build.yml`
  (the `AGENTS.md` and `docs/REPO-MAP.md` lines of `1d56aad` and `d994911` are
  repository bookkeeping of the same commits)
- Interfaces added: the Postgres-16 service and `TEST_DATABASE_URL` in the `check` job
  (still current); the global `publish-queue` group and "every run moves `latest`"
  (both **superseded**: the shared queue cancelled pending runs and lost versions,
  `latest` moved to whatever built last — repaired by **WP-M1-18** and **WP-M1-21**)
- Verified: today `check.yml` still carries the Postgres service; the queue and the
  unconditional `latest` are gone from the workflow
- Deviation: three commits, no WP, one of them introduced the defect WP-M1-18 had to
  repair — the reason this record names what is no longer true
- Follow-up WP: none — WP-M1-18, WP-M1-19 and WP-M1-21 own the publish chain today
- Open question: none
