# WP-M2-98: reporter metadata columns for internal reports

format: small-model
status: implemented
depends-on: WP-M2-95
phase: 2
context-budget: 16k tokens
spec: specs/02-data-model.md §4.8, PLAN.md §6 (`tickets` reporter data), PLAN.md §7 rule 1
spec-lines: 45

files-read:

- apps/api/src/db/schema.ts — `tickets` reporter columns and check helpers
- apps/api/src/db/migrations/0023_ticket_is_test.sql — hand-written migration style
- apps/api/src/db/migrations/meta/_journal.json — journal entries up to 0027
- apps/api/src/db/__tests__/migrations.spec.ts — journal and migration guards
- work-packages/m2/95-internal-create-title-switch.md — parent style

files-write:

- apps/api/src/db/schema.ts — reporter channel, reporter kind, reporting user
- apps/api/src/db/migrations/0028_ticket_reporter_metadata.sql — migration
- apps/api/src/db/migrations/meta/_journal.json — entry 28
- apps/api/src/db/__tests__/migrations.spec.ts — migration guard

interfaces:

- `tickets.reporter_channel` text nullable, check `phone` / `email` / `messenger`
- `tickets.reporter_kind` text nullable, check `internal` / `external`
- `tickets.reported_by_user_id` uuid nullable FK `users` `ON DELETE SET NULL`
- index `tickets_reported_by_user_id_idx`

## Task

1. In `apps/api/src/db/schema.ts` add the three nullable columns to `tickets`:
   `reporterChannel`, `reporterKind`, `reportedByUserId` with the FK to `users`
   (`ON DELETE set null`). Export `TICKET_REPORTER_CHANNELS` and
   `TICKET_REPORTER_KINDS` next to `TICKET_SOURCES`.
2. Add the two `IS NULL OR … IN (…)` checks and the index to the table callback.
3. Write migration `0028_ticket_reporter_metadata.sql` in the hand-written style
   of 0023: three `ALTER TABLE`, the FK, the two checks and the index.
4. Append journal entry `idx: 28` with `tag: "0028_ticket_reporter_metadata"`.
5. Extend `migrations.spec.ts`: the last journal entry is 0028 and the migration
   contains the three columns, both checks and the FK.
6. Bookkeeping in the same commit: `CHANGELOG.md`, `PLAN.md` §16 note,
   `docs/REPO-MAP.md` schema row, `work-packages/README.md` rows and the four
   child WP files listed in the handoff.

## Non-goals

- No service or route writes the columns yet (WP-M2-98b).
- No form (WP-M2-98c), no timeline (WP-M2-98d), no history (WP-M2-98e).
- No backfill of existing tickets: `NULL` means "not captured".

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green. The migration guard fails before the SQL exists and passes
after it. Database integration tests may skip without `TEST_DATABASE_URL`; report
that as unverified.

## Handoff

- Files changed: `schema.ts`, migration `0028`, journal, `migrations.spec.ts`
- Interfaces added: the three columns and the two exported value lists
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M2-98b (API and shared contracts), WP-M2-98c (form),
  WP-M2-98d (timeline), WP-M2-98e (history) — all four files exist in this commit
- Open question: none
