# WP-M14-147c: the configuration service checks the pool of the condition

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.4, §7.5
spec-lines: 40

depends-on: WP-M14-147b

files-read:

- apps/api/src/escalation/config.ts (the validation of the targets)
- packages/shared/src/schemas/escalation-config.ts (`escalationConditionLeaves`)
- apps/api/src/escalation/**tests**/config-routes.integration.spec.ts (the tests)

files-write:

- apps/api/src/escalation/config.ts

interfaces:

- `PUT /api/v1/escalation/config` — a condition that names a readiness pool
  that does not exist answers `400 invalid_target` with the field path of the
  condition

## Task

1. `apps/api/src/escalation/config.ts`: the service walks the conditions of
   every rule and of every action with `escalationConditionLeaves` and collects
   the leaves of the field `shift`. A pool that is not a row of `oncall_pools`
   answers `400 invalid_target` with the path of the condition — the rule of
   the target of an action (§7.5).
2. The same file: the check reuses the pool rows that the service already
   reads for the targets, so a configuration costs no second query.

## Non-goals

- No check of the members of a pool and no check of the shifts: a pool without a
  staffed shift is a valid configuration, it simply matches no rule (§7.4).
- No change of the error codes of the other targets.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the route answers `400 invalid_target` for an unknown
pool and stores a known one.

## Handoff

- Files changed: `apps/api/src/escalation/config.ts`,
  `apps/api/src/escalation/__tests__/config-routes.integration.spec.ts`,
  `docs/REPO-MAP.md`, this document, `work-packages/README.md`, `CHANGELOG.md`,
  `PLAN.md` §16
- Interfaces added: the check of the pool of the condition
- Verified: `npm run check`
- Follow-up WP: WP-M14-147d
- Open question: none
