# WP-M13-11: The removal of the old shared contracts

format: small-model
status: done
depends-on: WP-M13-10
phase: 13
milestone: m13
context-budget: 18k tokens
spec: specs/07-escalation.md §7.1, §7.6
spec-lines: 60

files-read:

- specs/07-escalation.md §7.1, §7.6
- packages/shared/src/schemas/escalation-stages.ts
- packages/shared/src/schemas/ticket.ts (the manual escalation schema)
- packages/shared/src/escalation.ts (the hard-coded rules)
- packages/shared/src/__tests__/escalation.test.ts

files-write:

- packages/shared/src/schemas/escalation-stages.ts (removed)
- packages/shared/src/schemas/ticket.ts
- packages/shared/src/schemas/index.ts
- packages/shared/src/escalation.ts

interfaces:

- `escalationStagesSchema`, `DEFAULT_ESCALATION_STAGES`, `nextEscalationStage`,
  `escalationStageName` are gone
- `manualEscalationRequestSchema` is gone
- `ESCALATION_RULES` and `escalationRulesFor` are gone; the rules live in the
  database (WP-M13-06)

## Task

1. Remove the contract of the former catalogue and its helpers; the stages of
   the new contract carry their names.
2. Remove the request schema of the manual escalation from the ticket contract.
3. Remove the hard-coded rule list and the resolver from the shared escalation
   module; the module keeps the pure helpers the scan needs.
4. Update the barrel exports and the shared tests.

## Non-goals

- No change to the web application (WP-M13-12).
- No change to the new contract of WP-M13-02.
- No change to the ticket workflow contract.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: all green; no export of the removed contracts is left.

## Handoff

- Files changed: the removed schema, the ticket contract, the barrel, the shared
  escalation module
- Interfaces added: none — exports are removed
- Verified: typecheck, the whole test run
- Deviation: `packages/shared/src/__tests__/escalation-stages.test.ts` is removed with the schema; the shared deadlines contract became hours-only together with WP-M13-13
- Follow-up WP: WP-M13-12 — the removal of the old administration page
- Open question: none
