# WP-M14-96: the API tests follow the numbered rules

format: small-model
status: done
depends-on: WP-M14-95
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 12

files-read:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts

files-write:

- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts

interfaces:

- the tests read the key of a seeded rule from the shared defaults instead of
  writing it into the expectation

## Task

1. Read the key of the seeded rule of a stage (and of a deadline rule) from
   `DEFAULT_WORKFLOW_ESCALATION_RULES` in the four integration suites of the
   escalation instead of naming it in the expectation.
2. Keep the expectations of the fired rules, the actions and the events
   unchanged in their wording.

## Non-goals

- No change of the contract, of the service or of the seed.
- No change of the behaviour of a test.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the four suites pass (28/28).

## Handoff

- Files changed: the four integration suites and the repository bookkeeping
- Interfaces added: none — the tests become independent of the key format
- Verified: the four suites 28/28
- Follow-up WP: WP-M14-97 (the remaining suites follow the numbered rules)
- Open question: none
