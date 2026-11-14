# WP-M14-59: The escalation stage chain in the database

format: small-model
status: planned
depends-on: WP-M14-58
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.11, §7.6; PLAN.md §6
spec-lines: 90

files-read:

- apps/api/src/db/schema.ts (`escalationStages`, `escalationRules`)
- apps/api/src/db/migrations/0031_escalation_config.sql
- apps/api/src/db/migrations/meta/_journal.json
- specs/07-escalation.md §7.6, §7.11

files-write:

- apps/api/src/db/migrations/0037_escalation_stage_chain.sql
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/meta/_journal.json

interfaces:

- `escalation_stages` columns `predecessor` (nullable text) and `reached_by` (jsonb, default `[]`)
- `escalation_rules.stage_key` foreign key to `escalation_stages.key` with `ON DELETE cascade`

## Task

1. Migration `0037_escalation_stage_chain.sql` on the existing tables
   (`0031` stays untouched as the history of the installation):
   add `predecessor` (nullable text) and `reached_by` (jsonb, default
   `'[]'::jsonb`) to `escalation_stages`, drop the CHECK
   `escalation_stages_key_check` (the key shape is validated by the shared
   contract and the service) and index `predecessor`.
2. Add the foreign key `escalation_rules.stage_key` → `escalation_stages.key`
   with `ON DELETE cascade`; drop the CHECK
   `escalation_rules_stage_key_check` and the enum part of
   `escalation_rules_reference_check` (the clock contract moves to the shared
   schema and the service).
3. Backfill the rows of an installed database, so the running chain does not
   change: `review` → predecessor `NULL`, `work_order` → `review`,
   `assignment` → `work_order`, `acceptance` → `assignment`,
   `acknowledgement` → `acceptance`, and the `reached_by` events of §7.1
   (`review_started` / `work_order_set` / `assigned`,`offered`,`claimed` /
   `accepted` / `acknowledged`).
4. Mirror both tables in `apps/api/src/db/schema.ts` with the same columns,
   indexes and constraints, register the migration in `_journal.json` and run
   `npm run db:migrate` on the development database.

## Non-goals

- No shared contract change (WP-M14-60), no seed change (WP-M14-61).
- No route, engine or UI change.
- No change of `escalation_firings`: `stage_key` stays plain text, no foreign key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run db:migrate -w @stoerdesk/api
npm run test:run
npm run wp:check
```

Expected: all green; the migration applies to an installed database without
dropping a stage or a rule; the seed of WP-M13-04 still starts (its five rows
stay valid without a predecessor column value); `npm run db:migrate` reports the
journal up to `0037`.

## Handoff

- Files changed: the migration, the schema, the journal
- Interfaces added: the columns `predecessor` and `reached_by`, the cascade key
- Verified: (to be filled by the implementing run)
- Follow-up WP: WP-M14-60 (the shared contracts)
- Open question: none
