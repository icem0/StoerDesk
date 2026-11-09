# WP-M9-05: dashboard snapshot service

format: small-model
status: done
depends-on: WP-M9-03, WP-M9-04
phase: 9
milestone: m9
context-budget: 20k tokens
spec: specs/11-dashboard.md §11.2–§11.5; ADR-0012 decisions 1, 3
spec-lines: 110

files-read:

- specs/11-dashboard.md (§11.2 snapshot, §11.3 counter, §11.4 tiles, §11.5 burning now)
- apps/api/src/oncall/coupling.ts (`resolveOnCallPerson` and its result)
- apps/api/src/db/schema.ts (`tickets`, `outbox`, `oncallShifts`, `ticketPauses`)
- apps/api/src/tickets/list.ts (query and count patterns)
- apps/api/src/db/migrations/0024_stats_views.sql (view columns)
- apps/api/src/oncall/__tests__/coupling.integration.spec.ts (service test setup)

files-write:

- apps/api/src/dashboard/service.ts
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts

interfaces:

- `buildDashboardSnapshot(database, { now, includeOnCall, includeChannels })`
- `resolveFaultFreeCounter(database, now)` and `resolveFaultFreeRecord(database, now)`
- `resolveDashboardTiles(database, now)` and `resolveBurningNow(database, now)`
- `resolveChannelStatus(database)` and `resolveOnCallTile(database, now)`

## Task

1. Add `apps/api/src/dashboard/service.ts`; every query reads `stats_tickets`,
   `outbox` or the existing on-call coupling, never a ticket detail in the API
   process.
2. Implement the fault-free counter and record of §11.3: the newest qualifying
   `reported_at`, the local whole days since it, and the longest gap over the
   ordered qualifying reports (the running gap counts).
3. Implement the tiles of §11.4: open and per-status counts, overdue,
   unreviewed (`NEW`), claimable `poolSize` (`OFFERED` without
   `assigned_user_id`), the on-call result with name/phone/end/warning, and the
   per-channel last `SENT`/`FAILED` plus pending/failed counts from `outbox`.
4. Implement `burningNow`: the ten nearest open, non-cancelled, non-test
   deadlines with ticket number, object name, status, priority and timestamps.
5. Add an integration test against a throwaway database: a new qualifying
   ticket resets the counter, a test ticket and a cancelled ticket do not, the
   record covers the longest historic gap, and the tiles/lists match the
   inserted reference rows. It skips with a named reason without
   `TEST_DATABASE_URL`.

## Non-goals

- No HTTP route and no SSE (WP-M9-06/07).
- No statistics aggregation (WP-M9-10/11).
- No anonymisation; the TV route applies it in WP-M9-09.
- No frontend code.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the counter-reset test of `PLAN.md` §20 item 8 passes or
skips with a named reason.

## Handoff

- Files changed: the dashboard service and its integration test
- Interfaces added: the snapshot and its section builders above
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-06, WP-M9-07 and WP-M9-09 consume the service
- Open question: none
