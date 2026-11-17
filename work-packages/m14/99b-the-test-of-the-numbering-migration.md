# WP-M14-99b: the test of the numbering migration

format: small-model
status: done
depends-on: WP-M14-99
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.5, §7.6, §7.7
spec-lines: 12

files-read:

- apps/api/src/db/migrations/0045_escalation_rule_numbering.sql
- apps/api/src/db/__tests__/helpers/testDatabase.ts

files-write:

- apps/api/src/db/__tests__/escalation-rule-numbering.integration.spec.ts

interfaces:

- the test builds the state before the migration, runs the statements of the
  migration and proves the numbered rules, actions and firing log

## Task

1. Build the state before the migration: the free keys of the seeded rules, an
   action of the review rule and a firing of the same rule.
2. Run the statements of `0045_escalation_rule_numbering.sql` on the database.
3. Prove the numbered keys of the rules, of the action and of the firing log.

## Non-goals

- No change of the migration.
- No change of the seed or of the service.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the numbering migration passes (1/1).

## Handoff

- Files changed: the integration test and the repository bookkeeping
- Interfaces added: none — the migration is proven
- Verified: the numbering migration 1/1
- Follow-up WP: WP-M14-100 (the service derives the keys)
- Open question: none
