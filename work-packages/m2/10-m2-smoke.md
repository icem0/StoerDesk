# WP-M2-10: Phase-2 exit-criterion E2E (report → status page)

format: small-model
status: implemented
depends-on: WP-M2-09
phase: 2
milestone: m2
context-budget: 14k tokens
spec: PLAN.md §16 phase 2 exit criterion ("QR report creates a ticket and shows the status page"); specs/06-report-form.md §7.3.4, WP-M2-05c/06b patterns
spec-lines: 0

files-read:

- PLAN.md §16
- apps/web/e2e/report-form.spec.ts (WP-M2-05c pattern)
- apps/web/playwright.config.ts
- apps/web/src/features/tickets/status-page.tsx

files-write:

- apps/web/e2e/report-flow.spec.ts

interfaces:

- Playwright test `report-flow.spec.ts`: create object via `POST /api/v1/objects`, submit `/m/<token>`, open `/s/<statusToken>`, assert ticket number, status and deadline — in `de` and `en`

## Task

Add the phase 2 exit-criterion smoke E2E that proves the full public flow end to end:

1. Add `apps/web/e2e/report-flow.spec.ts` (Playwright): sign in as admin is not needed for the public form, but the object must exist — create it through `POST /api/v1/objects` with the seeded administrator's session cookie, then open `/m/<token>`, fill fault chip + free text + phone, submit, assert the confirmation (ticket number `ST-<year>-NNNN`, status link `/s/<statusToken>`), then open `/s/<statusToken>` and assert the ticket number, current status and deadline.
2. Run the flow in `de` and `en` to prove both locales render the public pages.
3. Reuse the throwaway-database harness of `scripts/e2e-check.mjs` (WP-M1-12): skipped without reachable PostgreSQL or Chromium so `npm run check` stays green locally; in CI (`CI=true`) a missing prerequisite is an error.

## Non-goals

- Offline/outbox behaviour (covered by WP-M2-09b).
- Photo upload (covered by WP-M2-05c).
- Admin ticket list or any internal screen — the phase 2 criterion is public QR → ticket → status page only.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
npm run test:e2e
```

Expected result: all green; the new E2E passes against a real throwaway database, or prints the green skip notice when no database / Chromium is reachable. In CI (`CI=true`) a missing prerequisite is an error.

## Handoff

- Files changed: `apps/web/e2e/report-flow.spec.ts` (new; tests are excluded from the WP source-file count)
- Interfaces added: none
- Verified: `npm run check` and `npm run build` green; `npm run test:e2e` green or green skip
- Follow-up WP: none — phase 2 complete once this commit is pushed
- Open question (if any): none
