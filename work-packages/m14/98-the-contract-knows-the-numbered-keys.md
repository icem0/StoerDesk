# WP-M14-98: the contract knows the numbered keys

format: small-model
status: done
depends-on: WP-M14-97
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 16

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

interfaces:

- `escalationRuleKeyPattern` and `escalationActionKeyPattern` accept the
  composed key and the former free key
- `escalationRuleKey(stageKey, number)` names a rule, `escalationActionKey(ruleKey, number)`
  names an action
- `ESCALATION_DEADLINE_ROOT` is the root of the rules without a stage

## Task

1. Name the taxonomy of §7.5 in the shared contract: the key of a rule is the
   key of its stage and its number (`review#1`), the key of an action the key of
   its rule and its number (`review#1#1`), a rule without a stage belongs to the
   root `deadline`.
2. Accept the composed keys in the rule and in the action contract; the former
   free key stays valid, so an installation that was written before the
   numbering keeps a readable configuration.
3. Prove the helpers and the patterns in the shared test.

## Non-goals

- No change of the defaults of a fresh installation — they change with the
  migration (WP-M14-99).
- No change of the service and of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the shared suite passes (35/35 in the file).

## Handoff

- Files changed: the shared contract, its test and the repository bookkeeping
- Interfaces added: the key patterns, the key helpers and the deadline root
- Verified: the shared test 35/35, the typecheck of every workspace
- Follow-up WP: WP-M14-99 (the migration and the seed)
- Open question: none
