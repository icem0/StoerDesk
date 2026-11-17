# WP-M14-100: the service derives the keys

format: small-model
status: done
depends-on: WP-M14-99b
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 16

files-read:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts

interfaces:

- `PUT /api/v1/escalation/config` writes the key of a rule and of its action
  itself: the key of the stage and the number of the rule, the key of the rule
  and the number of the action
- a key that two rules of the installation would share answers
  `400 invalid_request`

## Task

1. Write the key of every rule and of every action in the configuration
   service: the number of a rule is its position inside its stage, the number
   of an action its position inside its rule.
2. Reject a body whose derived keys would collide — a stage named `deadline`
   beside a rule without a stage.
3. Prove the derived keys in the configuration test and adapt the stage chain
   and the distribution test to the numbered keys.

## Non-goals

- No change of the values of a rule and of its actions.
- No change of the administration.
- No change of the migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the API suite passes (895/895).

## Handoff

- Files changed: the configuration service, the three suites and the repository
  bookkeeping
- Interfaces added: the derived keys of a rule and of an action
- Verified: the API suite 895/895, the shared suite 145/145, the web suite
  301/301
- Follow-up WP: WP-M14-101 (the administration numbers the rules)
- Open question: none
