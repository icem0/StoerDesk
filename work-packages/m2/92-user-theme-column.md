# WP-M2-92: `theme` column on the users table

format: small-model
status: planned
depends-on: WP-M1-09 (users), WP-M2-80 (schema change pattern)
phase: 2
context-budget: 12k tokens
spec: PLAN.md §14 (UI: theme), PLAN.md §6 (data model)
spec-lines: 10

files-read:

- apps/api/src/db/schema.ts — `users` table (WP-M1-09)
- apps/api/src/db/migrations/0015_remove_systems_level.sql — migration pattern
- apps/api/src/db/meta/_journal.json — migration journal

files-write:

- apps/api/src/db/schema.ts — `theme` column on `users`
- apps/api/src/db/migrations/0016_user_theme.sql — column + check + default (migration)
- apps/api/src/db/meta/_journal.json — v3 entry for 0016 (fixture/journal)

interfaces:

- `users.theme`: text column, not null, default `auto`, check `users_theme_check` allows
  only `auto`, `light` or `dark`
- existing users get `'auto'` (seed untouched, §14: default follows
  `prefers-color-scheme`)

## Task

1. `schema.ts`: `theme: text('theme').notNull().default('auto')` plus
   `check('users_theme_check', sql`${'{@table theme}'} IN ('auto', 'light', 'dark')`)` —
   mirror the `users_locale_check` pattern.
2. `0016_user_theme.sql`: add the column with `DEFAULT 'auto'`, add the
   `NOT NULL CHECK (theme IN ('auto','light','dark'))` and switch the column to
   `NOT NULL` (existing rows read the default, i.e. `'auto'`).
3. Journal entry `{ "name": "0016_user_theme", "version": 3 }` after 0015.

## Non-goals

- No schema/API/UI changes (WP-M2-92b and WP-M2-92c).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

The DB tests of `apps/api` run against the CI Postgres service (locally skipped without
a database — reported as unverified when skipped).

## Handoff

- (filled by the implementing commit)
