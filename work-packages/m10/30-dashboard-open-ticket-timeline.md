# WP-M10-30: the dashboard snapshot carries the timeline and the last event

format: small-model
status: done
depends-on: WP-M10-19, WP-M9-05
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/11-dashboard.md §11.2; specs/05-timeline.md §5.3, §5.4
spec-lines: 60

files-read:

- packages/shared/src/schemas/dashboard.ts (the snapshot contract)
- packages/shared/src/timeline.ts (the shared timeline function)
- apps/api/src/dashboard/service.ts (the burning-now query)
- apps/api/src/tickets/list.ts (how the ticket list computes the mini timeline)
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts (the service test)
- specs/11-dashboard.md (§11.2 snapshot)

files-write:

- packages/shared/src/schemas/dashboard.ts
- apps/api/src/dashboard/service.ts
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts
- packages/shared/src/__tests__/dashboardStats.test.ts

interfaces:

- `DashboardSnapshot['burningNow'][number]` — the rows of the open tickets carry `timelineState`, `percent`, `remainingMs` and `lastEvent`
- `resolveBurningNow(database, now)` — the rows of the open tickets with the mini timeline and the last event

## Task

The office reads the open tickets of the dashboard like the rows of the ticket
list: with the mini timeline and with the last entry of the history. The
snapshot carries the data, the web renders it (WP-M10-31 and WP-M10-32).

1. The row schema of `burningNow` in
   `packages/shared/src/schemas/dashboard.ts` gains four fields:
   `timelineState` (one of the five states of `specs/05-timeline.md` §5.3),
   `percent` (0–100), `remainingMs` (whole milliseconds) and `lastEvent`
   (`{ type, at }` or `null`). The fields are required, so an old snapshot
   cannot be read as a new one. The tuple of the states is checked against the
   type of the shared timeline function.
2. `resolveBurningNow` in `apps/api/src/dashboard/service.ts` selects
   `acknowledged_at` next to the other columns and reads the newest event of
   every ticket with a lateral join over `ticket_events`. The timeline is
   computed with the shared `computeTicketTimeline` — the same function and the
   same inputs as the ticket list (`apps/api/src/tickets/list.ts`), so the mini
   bar of the dashboard and the mini bar of the list always agree. The
   instant of the snapshot (`now`) is the reference of the computation.
3. The service test inserts two events for one of the three open tickets and
   asserts the timeline fields of every row and the last event of the ticket
   that has one; the other rows carry `lastEvent: null`.
4. The fixture of the shared test carries the four new fields, and
   `specs/11-dashboard.md` §11.2 names them.

## Non-goals

- No change of the wall display, the start page or the menu.
- No change of the `tiles` block and no removal of the on-call tile from the
  contract — only the rendering changes.
- No pause time in the timeline: the ticket list computes it the same way,
  without the pauses.
- No new API route and no new permission.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the snapshot test asserts the timeline fields and the
last event of the open tickets.

## Handoff

- Files changed: the snapshot contract, the dashboard service, the service
  test, the shared test, the dashboard spec
- Interfaces added: the four fields of the open-ticket row
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: WP-M10-31 (the shared list of the open tickets), WP-M10-32
  (the start page) — the files exist in this commit
- Open question: none
