# WP-M13-03: The escalation tables and the migration

format: small-model
status: done
depends-on: WP-M13-02
phase: 13
milestone: m13
context-budget: 20k tokens
spec: specs/07-escalation.md §7.6
spec-lines: 60

files-read:

- specs/07-escalation.md §7.6
- apps/api/src/db/schema.ts (the table patterns and the checks)
- apps/api/src/db/migrations/0027_webhooks.sql (the SQL style)
- apps/api/src/db/migrations/meta/_journal.json (the journal)
- packages/shared/src/schemas/escalation-config.ts

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0031_escalation_config.sql
- apps/api/src/db/migrations/meta/_journal.json
- specs/07-escalation.md (the `stage_key` of the data model, corrected)

interfaces:

- `escalationStages`, `escalationRules`, `escalationActions`, `escalationFirings`
- the unique key `escalation_firings_ticket_rule_threshold_key` over
  `(ticket_id, rule_key, threshold_at)`

## Task

1. Add the four tables to `apps/api/src/db/schema.ts`: the stages with the fixed
   key, the names, the position and the active flag; the rules with the stage
   key, the reference, the minutes (jsonb), the percent, the condition and the
   position; the actions with the rule key, the type, the config and the
   condition; the firings with the ticket, the rule key, the threshold and the
   firing time.
2. Write the migration `0031_escalation_config.sql` with the tables, the foreign
   keys (`ON DELETE CASCADE` for the actions, `ON DELETE CASCADE` for the
   firings of a ticket), the indexes and the checks of the enums.
3. Register the migration in the journal (`idx 31`).

## Non-goals

- No seed of the rows (WP-M13-04).
- No service, no route, no UI.
- No change to an existing table.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the migration runs on a throwaway database and the four
tables exist with their constraints.

## Handoff

- Files changed: the schema, the migration, the journal, the corrected line of
  the spec
- Interfaces added: the four tables and their unique key
- Verified: typecheck, lint, the migration on a throwaway database
- Follow-up WP: WP-M13-04 — the seed of the stages and the rules
- Open question: none
