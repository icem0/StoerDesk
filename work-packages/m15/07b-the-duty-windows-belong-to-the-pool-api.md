# WP-M15-07b: the duty windows belong to the pool — the API

format: small-model
status: done
depends-on: WP-M15-07
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.2, §4a.3.2
spec-lines: 40

files-read:

- apps/api/src/oncall/pools.ts (the pool CRUD routes)
- apps/api/src/oncall/service.ts (the shift generator)
- apps/api/src/oncall/settings.ts (the global settings reader and writer)
- apps/api/src/oncall/routes.ts (the settings routes)

files-write:

- apps/api/src/oncall/pools.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/settings.ts
- apps/api/src/oncall/routes.ts

interfaces:

- `GET /api/v1/oncall/pools` answers `weeklyWindows` per pool
- `POST`/`PATCH /api/v1/oncall/pools` write the pool windows
- `generateShifts` reads `oncall_pools.weekly_windows` of its pool
- `GET/PUT /api/v1/settings/oncall` no longer carry windows

## Task

1. The pool list, the create and the update route carry `weeklyWindows`.
2. `generateShifts` reads the windows of the requested pool: windows present →
   `generateOncallWindowSlots` for that pool; none → the global continuous plan.
3. `settings.ts` and the settings routes drop `oncall.weekly_windows`; the
   default pool stays and keeps its active-pool guard.

## Non-goals

- No change of the shift state machine, the coupling or the iCal feed.
- No new route: the pool `PATCH` is the write path.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
```

Expected: green; the integration tests of WP-M15-07d drive both plans.

## Handoff

- Files changed: the four route/service files above
- Interfaces added: the pool payload and the per-pool generation
- Verified: typecheck and the unit suite
- Follow-up WP: WP-M15-07c and WP-M15-07d — the files exist in this commit
- Open question: none
