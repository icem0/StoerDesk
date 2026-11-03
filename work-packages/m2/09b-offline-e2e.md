# WP-M2-09b: Offline E2E test

format: small-model
status: implemented
depends-on: WP-M2-09a
phase: 2
milestone: m2
context-budget: 12k tokens
spec: PLAN.md §10 (offline report and sync)
spec-lines: 0

files-read:

- PLAN.md §10
- apps/web/src/features/tickets/report-form-page.tsx
- apps/e2e/report-form.spec.ts (WP-M2-05c pattern)

files-write:

- apps/web/e2e/offline-report.spec.ts

interfaces:

- Playwright test: flight mode, send report, go online, exactly one ticket

## Task

Prove the offline report path end to end.

1. Add `apps/web/e2e/offline-report.spec.ts` (Playwright): sign in as admin is not needed — the public form is unguarded. Create an object through `POST /api/v1/objects` (using the seeded/admin credentials or the public QR route), open `/m/<token>`, set the browser offline (`context.setOffline(true)`), fill and submit the form (report lands in the Dexie outbox, badge shows "1 wartet"), go back online, wait for the replay, and assert exactly one ticket exists for the object (`GET /api/v1/public/tickets/open` count is 1 and no duplicate).
2. Reuse the throwaway-database harness of `scripts/e2e-check.mjs` (WP-M1-12): the test runs against `stoerdesk_e2e_<run>` and is skipped without a reachable PostgreSQL or Chromium so `npm run check` stays green locally.

## Non-goals

- Testing every sync trigger (online listener, app start) — covered by WP-M2-09a manually.
- Photo upload offline (photos are part of the payload; the E2E uses a text-only report).

## Acceptance

Run and report the exact commands:

```bash
npm run test:e2e
```

Expected result: the offline E2E passes against a real throwaway database, or prints the
green skip notice when no database / Chromium is reachable (developer machine). In CI
(`CI=true`) a missing prerequisite is an error.

## Handoff

- Files changed: `apps/web/e2e/offline-report.spec.ts` (new, tests are excluded from the WP file count)
- Interfaces added: none
- Verified: `npm run test:e2e` green or green skip
- Follow-up WP: none — WP-M2-09 and its children are complete
- Open question (if any): none
