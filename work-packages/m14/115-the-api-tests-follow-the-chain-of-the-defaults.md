# WP-M14-115: the API tests follow the chain of the defaults

format: small-model
status: done
depends-on: WP-M14-114
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.1, §7.5
spec-lines: 20

files-read:

- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts
- apps/api/src/db/__tests__/escalation-rule-numbering.integration.spec.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts

files-write:

- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts
- apps/api/src/db/__tests__/escalation-rule-numbering.integration.spec.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts

interfaces:

- the seed test and the configuration test read the chain from the shared
  defaults
- the exit criterion counts the escalation events of its own rule

## Task

1. Read the expected stages, the expected rules and the chain of the
   configuration test from `DEFAULT_WORKFLOW_ESCALATION_STAGES` and
   `DEFAULT_WORKFLOW_ESCALATION_RULES` instead of naming them in the test.
2. Count the escalation events of the exit criterion per rule, so a rule of
   another stage does not change the expectation.
3. Keep the wording and the intent of the four suites.

## Non-goals

- No change of the contract, of the service and of the engine.
- No change of the default chain — it starts with the stage `new` in
  WP-M14-116.
- No change of the behaviour of a test.

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

- Files changed: the four suites and the repository bookkeeping
- Interfaces added: none
- Verified: the API suite 896/896
- Follow-up WP: WP-M14-116 (the shared contract knows the stage NEW)
- Open question: none
