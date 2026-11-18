# WP-M14-148a: the column of the open password change

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/01-rbac.md §3.9
spec-lines: 20

depends-on: WP-M14-148

files-read:

- apps/api/src/db/migrations/0050_object_priority_overrides.sql (the shape of a migration)
- apps/api/src/db/migrations/meta/_journal.json (the journal)
- apps/api/src/db/schema.ts (the `users` table)

files-write:

- apps/api/src/db/migrations/0051_users_must_change_password.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts

interfaces:

- `users.must_change_password` — boolean, not null, default `false`: the flag of
  an account whose password is a one-time password (ADR-0031)

## Task

1. Migration `0051_users_must_change_password.sql`: `ALTER TABLE "users" ADD
   COLUMN "must_change_password" boolean NOT NULL DEFAULT false`. The default
   keeps every installed account usable — an existing user holds a password of
   their own, never a one-time password.
2. The same migration carries no backfill and no index: the flag is read with
   the user of a session, never searched.
3. `apps/api/src/db/schema.ts`: the `users` table gains the column
   `mustChangePassword: boolean('must_change_password').notNull().default(false)`.
4. The journal `apps/api/src/db/migrations/meta/_journal.json` gains the entry
   `idx 51` with the tag `0051_users_must_change_password`.

## Non-goals

- No service, no route, no UI (WP-M14-148b … WP-M14-148f).
- No index and no backfill: the flag is read with the user of a session.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run db:migrate -w @stoerdesk/api
```

Expected: all green; the migration applies to an installed database without
touching a row; the journal reaches `0051`.

## Handoff

- Files changed: the migration, the journal, the schema
- Interfaces added: the column `users.must_change_password`
- Verified: typecheck, ESLint, vitest (`db:migrate` runs only where a database
  is reachable)
- Follow-up WP: WP-M14-148b
- Open question: none
