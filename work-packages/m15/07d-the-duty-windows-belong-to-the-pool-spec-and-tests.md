# WP-M15-07d: the duty windows belong to the pool — the spec and the tests

format: small-model
status: done
depends-on: WP-M15-07c
phase: 15
milestone: m15
context-budget: 14k tokens
spec: specs/04-oncall.md §4a.1, §4a.2, §4a.3.2
spec-lines: 40

files-read:

- specs/04-oncall.md (the settings, pool and window sections)
- packages/shared/src/**tests**/oncall.test.ts (the settings tests)
- apps/api/src/oncall/**tests**/routes.integration.spec.ts (the settings routes tests)
- apps/api/src/oncall/**tests**/window-plan.integration.spec.ts (the exit criterion)

files-write:

- specs/04-oncall.md
- packages/shared/src/**tests**/oncall.test.ts
- apps/api/src/oncall/**tests**/routes.integration.spec.ts
- apps/api/src/oncall/**tests**/window-plan.integration.spec.ts

interfaces:

- the spec names `oncall_pools.weekly_windows` as the home of the windows
- the shared tests drive `resolveOncallWindows`
- the route tests write the windows of a pool and prove the per-pool plan
- the exit criterion writes the office windows on the „Verwaltung" pool

## Task

1. `specs/04-oncall.md` drops `oncall.weekly_windows` from §4a.1, adds the pool
   column in §4a.2 and states the two scopes in §4a.3.2.
2. The shared tests replace the settings window cases with
   `resolveOncallWindows` cases.
3. The route tests write and read the windows through the pool `PATCH` and
   reject a malformed window with `400`.
4. The window-plan exit test patches the pool instead of the global settings.

## Non-goals

- No change of the generator itself and no new acceptance script.
- No migration test: the backfill is a one-time SQL statement.

## Acceptance

```bash
npm run test:run
npm run wp:check
```

Expected: green (the integration files skip without a database and are reported
as unverified).

## Handoff

- Files changed: the spec and the three test files above
- Interfaces added: none beyond the per-pool contract
- Verified: the unit suite; the integration files skip without Postgres
- Follow-up WP: none — WP-M15-07 is closed
- Open question: none
