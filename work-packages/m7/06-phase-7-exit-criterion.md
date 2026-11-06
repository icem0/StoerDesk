# WP-M7-06: phase-7 exit criterion and record

format: small-model
status: implemented
depends-on: WP-M7-04 (outbox rows in the create transaction), WP-M7-04c (the outbox drain worker, its retries and its pg-boss schedule), WP-M7-05 (the notification channel fallback chain)
phase: 7
context-budget: 20k tokens
spec: PLAN.md §16 phase 7 (exit criterion "channel failure retries and falls back; history shows it"), §20 acceptance 10 ("A failed notification channel retries, then falls back; the failure is visible in the history")
spec-lines: 20

WP-M7-04, WP-M7-04c and WP-M7-05 built the notification chain and asserted it at
outbox-row and event level. The phase-7 exit criterion is only closed when the
history assertion runs against the **real API answer** — like WP-M6-13 closed
phase 6 — and when the phase record (backlog table, `docs/REPO-MAP.md`,
`PLAN.md` §16) says the phase is complete.

files-read:

- apps/api/src/notifications/outbox.ts — `enqueueOutbox`, `drainOutbox`, `escalationChain`, `finishRow` (WP-M7-04, WP-M7-04c, WP-M7-05)
- apps/api/src/notifications/__tests__/outbox.integration.spec.ts — the drain assertions on PostgreSQL and the mock-server pattern (WP-M7-04c, WP-M7-05)
- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts — the exit-criterion shape: throwaway database plus `buildServer()` plus the `ticket.read` detail answer (WP-M6-13)
- apps/api/src/tickets/detail.ts — `GET /api/v1/tickets/:ticketNo` returns every `ticket_events` row with its payload
- PLAN.md §16 (phase 7 exit criterion, current state) and §20 acceptance 10

files-write:

- apps/api/src/notifications/__tests__/notification-exit.integration.spec.ts — the phase-7 exit test
- docs/REPO-MAP.md — the new test-module row
- PLAN.md — §16 current state, backlog row
- work-packages/README.md — backlog row and phase-7 status prose

interfaces:

- test "channel failure retries and falls back; history shows it": a ticket created
  with only a signal outbox row, drained with signal and matrix configured, ends
  the signal row `FAILED` after three attempts, queues one `PENDING` matrix
  fallback row in the same transaction, drains it `SENT` in the same run and the
  `GET /api/v1/tickets/:ticketNo` answer carries exactly one
  `notification_failed` (`{ channel: 'signal', ticketNo, attempts: 3 }`) and one
  `notification_sent` (`{ channel: 'matrix', ticketNo, attempts: 1 }`) next to the
  `created` event
- a second `drainOutbox` over the terminal rows writes `{ sent: 0, failed: 0, fallback: 0, attempts: 0 }`,
  adds no event and no row

## Task

1. Create the WP document itself in this commit.
2. Write `notification-exit.integration.spec.ts` on the throwaway-database plus
   `buildServer()` pattern of `escalation-exit.integration.spec.ts` (seed RBAC, admin
   user with the seeded `admin` role, session cookie, `ticket.read` detail route).
3. In `beforeAll`: migrate, create object, ticket and its `created` event, call
   `enqueueOutbox` with an environment whose only configured channel is signal —
   one `PENDING` row, the WP-M7-04 product path.
4. Assert the criterion: drain with signal failing (unreachable bridge) and matrix
   answering a local mock server; `drainOutbox` returns
   `{ sent: 1, failed: 0, fallback: 1, attempts: 4 }`; the detail answer through the
   real API carries the `created` event plus exactly one `notification_failed` for
   signal with `attempts: 3` and one `notification_sent` for matrix with
   `attempts: 1`; the mock server received exactly one Matrix `m.text` body, so the
   fallback really left the process; a second drain adds no event and no row.
5. Update `docs/REPO-MAP.md` (one row), `PLAN.md` §16 and the backlog tables.

## Non-goals

- No dashboard tile and no admin warning on channel failure (`PLAN.md` §12, §13 — phase 9).
- No web push, Telegram or SMTP adapter; no new routes or product code — the exit
  criterion asserts what WP-M7-01 … WP-M7-05 built.
- No browser E2E; the criterion is an API/history assertion (`PLAN.md` §16 phase 7).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The exit test runs against PostgreSQL or skips with a named
reason; a skipped run is reported as unverified, never as green (`PLAN.md` §18).

## Handoff

- Files changed: the exit spec, `docs/REPO-MAP.md` (one new module row), `PLAN.md`
  §16 (current state, backlog row), `work-packages/README.md` (backlog row, phase-7
  status), `CHANGELOG.md`
- Interfaces added: none; the test asserts the phase-7 contract of WP-M7-04c and
  WP-M7-05 through `GET /api/v1/tickets/:ticketNo`
- Verified: typecheck, lint, test:run (the exit test green against a throwaway
  PostgreSQL), i18n:check, wp:check
- Deviation: `docs/REPO-MAP.md` was already 213 lines before this WP (over its own
  200-line budget); the new row adds one more line and nothing was trimmed — the
  map needs a compaction pass in a later repo WP.
- Follow-up WP: none — phase 7 closes; on-call (phase 8) and the dashboard tile
  (`PLAN.md` §12/§13) are later phases.
- Open question: none
