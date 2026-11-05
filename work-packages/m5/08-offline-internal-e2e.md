# WP-M5-08: offline internal actions E2E — the phase 5 exit criterion (web)

format: small-model
status: done
depends-on: WP-M5-05, WP-M5-06, WP-M5-07
phase: 5
milestone: m5
context-budget: 20k tokens
spec: PLAN.md §16 phase 5 (exit criteria), specs/09-offline.md §9.1 pattern
spec-lines: 30

files-read:

- apps/web/e2e/offline-report.spec.ts — the offline/online Playwright pattern of WP-M2-09b
- apps/web/e2e/workflow.spec.ts — sign-in, object/ticket setup, API-driven transitions
- apps/web/src/features/tickets/ticket-detail-page.tsx — the buttons the test drives
- apps/web/src/features/tickets/offline-action-banner.tsx — the conflict banner under test

files-write:

- apps/web/e2e/offline-internal.spec.ts — Playwright E2E, `de` and `en`

interfaces:

- `test('offline acknowledge replays into exactly one event')` — sign in as the
  bootstrap administrator, create an object and a ticket, drive
  `review_started` → `work_order_set` → `assigned` → `accepted` through the API
  (the WP-M4-01 pattern), switch the context offline, open the detail page from
  cache (WP-M5-07), acknowledge with a result: the page shows the queued notice,
  switch online, the replay delivers and the detail shows `ACKNOWLEDGED` with
  exactly one `acknowledged` event in the history
- `test('conflicting offline write stays visible')` — queue an acknowledge
  offline, cancel the ticket through the API while offline, go online: the
  replay answers `409 invalid_transition`, the banner shows the conflict with
  the server status, discard removes the row and the ticket stays `CANCELLED`

## Task

1. Reuse the offline toggling of `offline-report.spec.ts`
   (`context.setOffline`) and the sign-in/object/ticket setup of
   `workflow.spec.ts`.
2. Write both tests in `de` and `en` (four tests); every assertion names the
   status badge and the `ticket_events` chain, never plaintext of user data.
3. Assert idempotency visibly: after replay the event chain contains the
   `acknowledged` event exactly once even when the replay retried.
4. This package closes phase 5: report the exit criterion "offline acknowledge
   syncs and conflicts are shown" as proven by these tests in CI.

## Non-goals

- No offline claim/accept or shift confirm — online-only or phase 8.
- No new product code; a failing test here exposes bugs of WP-M5-04 … WP-M5-07
  and is fixed in those packages, not by weakening the test.

## Acceptance

```bash
npm run lint
npm run wp:check
npm run test:e2e
```

Expected: lint and wp:check green locally; the E2E skips without a reachable
PostgreSQL and Chromium (this container) and runs in CI — report it as
unverified locally, never as green.

## Handoff

- Files changed: `apps/web/e2e/offline-internal.spec.ts` (new — the phase 5 exit criterion in `de` and `en`)
- Interfaces added: none; the test drives `useInternalActions` / `replayInternalActions` / `clearUserCache` through the UI and the API, no new product surface
- Verified: `npm run lint` and `npm run wp:check` green locally; `npm run test:e2e` skips without a reachable PostgreSQL and Chromium (this container) and runs in CI — report it as unverified locally, never as green; the two acceptance scenarios are "offline acknowledge replays into exactly one event" and "conflicting offline write stays visible until discarded"
- Follow-up WP: WP-M5-09 (`m5/09-clear-internal-cache-on-signout.md`)
- Open question: none
