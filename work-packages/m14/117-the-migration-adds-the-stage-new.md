# WP-M14-117: the migration adds the stage NEW

format: small-model
status: done
depends-on: WP-M14-116
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.1, §7.11
spec-lines: 20

files-read:

- apps/api/src/db/migrations/0045_escalation_rule_numbering.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/__tests__/escalation-rule-numbering.integration.spec.ts

files-write:

- apps/api/src/db/migrations/0046_escalation_stage_new.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/__tests__/escalation-stage-new.integration.spec.ts

interfaces:

- an installed chain gets the stage `new` (`Neu` / `New`) at position 1 as its
  first stage; the old first stage names it as predecessor and every stage
  moves one position behind
- the rule `new#1` of the new stage carries `received_at` and the minutes of
  ADR-0008
- a chain that already knows the stage, an empty chain (a fresh installation
  takes the chain of §7.1 from the seed) or a chain whose position reached 20
  stays untouched; the milestones, the clocks and the rules of the other
  stages keep their rows

## Task

1. Write the migration `0046_escalation_stage_new.sql`: when the chain has no
   stage `new` and fewer than 20 stages with positions below 20, shift every
   stage one position behind, give the stage without predecessor the
   predecessor `new` and insert the stage `new` at position 1 with the names
   `Neu` / `New` and an empty `reached_by`.
2. Insert the rule `new#1` for the new stage with the reference `received_at`,
   the minutes of ADR-0008, the empty condition and no actions.
3. Register the migration in the journal of the migrations folder.
4. Prove the anchor in the migration test: rebuild the chain of an
   installation without the stage, run the statements and expect the chain of
   the defaults; a second run changes nothing and a chain at the position
   limit stays alone.

## Non-goals

- No change of the milestones, the clocks or the minutes of the other stages.
- No change of the rule keys — they keep their stage and their number.
- No change of the administration and of the engine.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the migration test passes (3/3).

## Handoff

- Files changed: the migration, its journal entry, the migration test and the
  repository bookkeeping
- Interfaces added: the stage `new` in an installed chain
- Verified: the migration test 3/3, the API suite, the web suite
- Follow-up WP: WP-M14-118 (the spec and the module map name the stage NEW)
- Open question: none
