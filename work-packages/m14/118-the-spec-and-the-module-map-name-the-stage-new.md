# WP-M14-118: the spec and the module map name the stage NEW

format: small-model
status: done
depends-on: WP-M14-117
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.1, §7.2, §7.11
spec-lines: 16

files-read:

- specs/07-escalation.md
- docs/REPO-MAP.md
- apps/api/src/db/seed-escalation.ts

files-write:

- specs/07-escalation.md
- docs/REPO-MAP.md
- apps/api/src/db/seed-escalation.ts

interfaces:

- the spec names the stage `new` as the first stage of the default chain and
  the inherited clock of a predecessor that is never reached
- the module map names the migration `0046_escalation_stage_new.sql` and the
  clock check of the configuration service

## Task

1. State in §7.1 that the default chain opens with the stage `new` (Neu / New)
   — the arrival, never reached — and that the stage `review` waits from the
   report behind it.
2. Name the rule `new` in the table of §7.2 and state that the rule of the
   first stage is due with the ticket.
3. State in §7.11 that a predecessor without a reaching event hands its clock
   down, that the helper `escalationStageClockEvents` answers the clock, and
   that the migration `0046` anchors an installed chain.
4. Name the stage NEW in the rows of the escalation administration and of the
   configuration service of the module map, and add the row of the migration.
5. Correct the comment of the seed module: the chain of §7.1 is inserted the
   first time the API starts.

## Non-goals

- No change of the behaviour — the chain, the clock and the migration are
  delivered since WP-M113 … WP-M14-117.
- No new module.

## Acceptance

```bash
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec and the map describe the delivered behaviour.

## Handoff

- Files changed: the spec slice, the module map, the comment of the seed module
  and the repository bookkeeping
- Interfaces added: none — the record catches up with the stage NEW
- Verified: lint, the full test suite, wp:check
- Follow-up WP: none — the escalation issues of the office are closed
- Open question: none
