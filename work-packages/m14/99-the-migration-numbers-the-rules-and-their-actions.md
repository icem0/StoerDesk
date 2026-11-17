# WP-M14-99: the migration numbers the rules and their actions

format: small-model
status: done
depends-on: WP-M14-98
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.2, §7.5, §7.6
spec-lines: 24

files-read:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/db/seed-escalation.ts
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/migrations/0044_ticket_assignees.sql

files-write:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/db/migrations/0045_escalation_rule_numbering.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/seed-escalation.ts

interfaces:

- a rule of the stage `review` is named `review#1`, the second rule of the
  stage `acceptance` is named `acceptance#2`
- a rule without a stage belongs to the root `deadline` — `deadline#1`
- an action of the rule `review#1` is named `review#1#1`
- the firing log and the actions follow the rename of their rule

## Task

1. Write the migration `0045_escalation_rule_numbering.sql`: the rules get the
   key of their stage and their number, the actions the key of their rule and
   their number, the rules without a stage the root `deadline`. The number of a
   rule is its position inside its stage, the number of an action its position
   inside its rule.
2. Rename the actions and the firing log with the rules; the foreign key of the
   actions is dropped for the rename and restored afterwards.
3. Register the migration in the journal.
4. Name the defaults of a fresh installation with the numbered keys and adapt
   the map of the former settings values to them.

## Non-goals

- No change of the service — it still writes the key it receives (WP-M14-100).
- No change of the administration.
- No change of the values of a rule.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the seed writes the numbered keys and the migration
renames an installed configuration.

## Handoff

- Files changed: the shared defaults, the migration, the journal, the seed and
  the repository bookkeeping
- Interfaces added: the numbered keys of the database
- Verified: the seed test 2/2, the escalation suites 13/13, the numbering
  migration 1/1
- Follow-up WP: WP-M14-99b (the test of the migration), WP-M14-100 (the service
  derives the keys)
- Open question: none
