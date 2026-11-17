# WP-M14-114: the engine and the service use the clock of a stage

format: small-model
status: done
depends-on: WP-M14-113
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 14

files-read:

- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/config.ts

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/config.ts

interfaces:

- the clock of a stage whose predecessor is never reached starts at the report
- the configuration service checks the reference of a rule against the clock of
  its stage with the shared helper

## Task

1. Let the engine compute the clock of a stage with the helper of the shared
   contract: a predecessor that the workflow never reached hands its own clock
   down, so the clock of the stage is the report.
2. Use the helper in the configuration service: the explicit reference of a
   rule must match the clock of its stage, and the repair of a reference that
   no longer matches follows the same clock.

## Non-goals

- No change of the default chain — it starts with the stage `new` in
  WP-M14-116.
- No change of the evaluation of a condition.
- No change of the first stage of a chain — its rules stay due with the ticket.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the API suite passes.

## Handoff

- Files changed: the scan of the escalation, the configuration service and the
  repository bookkeeping
- Interfaces added: none — the engine and the service use the shared helper
- Verified: the API suite, the shared suite, the typecheck of the workspaces
- Follow-up WP: WP-M14-115 (the API tests follow the chain of the defaults)
- Open question: none
