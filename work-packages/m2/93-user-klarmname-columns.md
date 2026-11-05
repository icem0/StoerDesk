# WP-M2-93: `given_name` and `family_name` on the users table

format: small-model
status: implemented
depends-on: WP-M1-09 (users), WP-M2-92 (users column pattern)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §6 (data model), specs/01-rbac.md §4.1 (RBAC tables), PLAN.md §15 (privacy)
spec-lines: 24

files-read:

- apps/api/src/db/schema.ts — `users` table with `theme` (WP-M1-09, WP-M2-92)
- apps/api/src/db/migrations/0016_user_theme.sql — users column migration pattern
- apps/api/src/db/migrations/meta/_journal.json — journal tail after `0017_fix_ticket_event_delete_trigger`
- apps/api/src/db/seed-base.ts — the bootstrap administrator insert (WP-M1-06, WP-M1-14)
- specs/01-rbac.md — §4.1 table contract of the RBAC tables

files-write:

- apps/api/src/db/schema.ts — `givenName` and `familyName` on `users`, name index, checks
- apps/api/src/db/migrations/0018_user_klarmname.sql — columns, helper, checks, fill, index
- apps/api/src/db/migrations/meta/_journal.json — entry for 0018
- apps/api/src/db/seed-base.ts — derived family name for the bootstrap administrator

interfaces:

- `users.given_name`, `users.family_name`: text, `NOT NULL`, default `''`, checks
  `users_given_name_length_check`, `users_family_name_length_check` (max 64) and
  `users_klarmname_trimmed_check` (stored value equals `TRIM(value)`)
- `users_name_idx` — index on `lower(family_name), lower(given_name)` (the sortable order)
- `derive_user_family_name(email text) → text` — letters of the email local part, first
  letter upper case; `''` when the local part has no letters
- `seed-base.ts`: the bootstrap user gets `family_name = deriveFamilyName(email)`,
  `given_name = ''`; an existing user is never touched (WP-M1-14 rule stays)

## Task

1. `schema.ts` `users`: add `givenName: text('given_name').notNull().default('')` and
   `familyName: text('family_name').notNull().default('')` directly after `email`, add
   `index('users_name_idx').on(sql\`lower(${table.familyName})\`, sql\`lower(${table.givenName})\`)`
   and the three checks, mirroring the `users_locale_check` / `users_theme_check` style.
2. `0018_user_klarmname.sql`: create the helper `derive_user_family_name()` (plpgsql,
   same block style as 0017), add both columns with `DEFAULT '' NOT NULL`, add the
   length checks and the trimmed check, fill the rows that already exist
   (`UPDATE "users" SET "family_name" = derive_user_family_name("email") WHERE "family_name" = '';`)
   and create `CREATE INDEX "users_name_idx" ON "users" USING btree (lower("family_name") , lower("given_name") );`
   in that order, `--> statement-breakpoint` between the statements.
3. Journal: append `{ "idx": 18, "version": "7", "tag": "0018_user_klarmname", "breakpoints": true }`
   after 0017.
4. `seed-base.ts`: a module function `deriveFamilyName(email: string): string` that mirrors
   the helper (local part before `@`, non-letters removed, first letter upper case), used
   in the insert as `familyName`; `givenName` stays `''`. An existing user keeps its names.

## Non-goals

- No schema or API change for the name fields (WP-M2-94 owns the shared user schemas and
  the users API), no UI, no i18n.
- No change of the login identity: `email` stays the unique login key (`users_email_key`).
- No reporter contact change (`tickets.reporter_*` stay as they are, §15 retention).
- No ticket history change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. `migrations.spec.ts` gains the 0018 expectations (columns, checks,
index, fill) and the base-schema column list; the `users` inserts of the api integration
specs keep working because both columns default to `''`. DB integration tests are skipped
without a reachable PostgreSQL — reported as unverified locally, CI has the service.

## Handoff

- Files changed: `apps/api/src/db/schema.ts`, `apps/api/src/db/migrations/0018_user_klarmname.sql`,
  `apps/api/src/db/migrations/meta/_journal.json`, `apps/api/src/db/seed-base.ts`,
  `apps/api/src/db/__tests__/migrations.spec.ts` (test)
- Interfaces added: `users.given_name` / `users.family_name` (text, not null, default `''`,
  length ≤ 64, stored trimmed), `users_name_idx` over `lower(family_name), lower(given_name)`,
  `derive_user_family_name()` in the migration and `deriveFamilyName()` in `seed-base.ts`
- Verified: `npm run check` green — typecheck, eslint (0 errors, only the pre-existing
  warnings), vitest 483 tests green and `wp:check` 219 WP green. The DB integration
  tests ran against a real throwaway PostgreSQL (no test skipped): `seed-base.integration.spec.ts`
  5 tests and `migrations.spec.ts` 35 tests. `test:e2e` was skipped — this container has
  no Chromium; the CI check run has it.
- Follow-up WP: WP-M2-94 (name fields in the shared user schemas and the users API)
- Open question: none
