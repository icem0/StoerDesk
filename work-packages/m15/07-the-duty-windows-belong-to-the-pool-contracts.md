# WP-M15-07: the duty windows belong to the pool — contracts and storage

format: small-model
status: done
depends-on: WP-M15-05
phase: 15
milestone: m15
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.1, §4a.2, §4a.3.2
spec-lines: 60

files-read:

- packages/shared/src/oncall.ts (the settings type and the window resolver)
- packages/shared/src/schemas/oncall.ts (the pool and settings schemas)
- apps/api/src/db/schema.ts (the oncall_pools table)
- apps/api/src/db/migrations/0051_users_must_change_password.sql (the migration shape)

files-write:

- packages/shared/src/oncall.ts
- packages/shared/src/schemas/oncall.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0052_oncall_pool_weekly_windows.sql

interfaces:

- `oncall_pools.weekly_windows` jsonb, not null, default `[]`
- `resolveOncallWindows(value): OncallWindow[]` — the per-pool resolver
- `oncallPoolSchema.weeklyWindows`, optional `weeklyWindows` on create and update
- `oncall.weekly_windows` is no longer part of the settings contract

## Task

1. `OncallSettings` and `resolveOncallSettings` lose `weeklyWindows`. The
   window resolver becomes the exported `resolveOncallWindows(value)` for one
   pool; an invalid value resolves to `[]` (the continuous plan).
2. `oncallPoolSchema` carries `weeklyWindows`; create and update accept the
   optional array, at most one window per weekday, end later than start.
3. `oncallPools` gains the jsonb column `weekly_windows` (not null, default
   `[]`).
4. Migration `0052_oncall_pool_weekly_windows` adds the column, copies the
   stored global `oncall.weekly_windows` once into every active pool and
   deletes the global setting row. The journal entry belongs to the same
   commit.

## Non-goals

- No per-pool continuous plan: the global week start, start time and duration
  stay the fallback for a pool without windows.
- No other table and no change of the shift schema.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run wp:check
```

Expected: green; the pool schema rejects two windows of one weekday.

## Handoff

- Files changed: the four files above and the migration journal
- Interfaces added: the column, the resolver and the pool contract
- Verified: typecheck and `wp:check`
- Follow-up WP: WP-M15-07b (the API), WP-M15-07c (the administration),
  WP-M15-07d (the spec and the tests) — the files exist in this commit
- Open question: none
