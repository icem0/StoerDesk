# WP-M14-150b: the distribution names the technician

format: small-model
status: planned
depends-on: WP-M14-150a
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 30

files-read:

- apps/api/src/escalation/distribution.ts (the technicians of a target)
- apps/api/src/oncall/members.ts (the members of a pool and of a group)
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts (the test)
- apps/api/src/db/schema.ts (`users`)

files-write:

- apps/api/src/escalation/distribution.ts
- apps/api/src/escalation/__tests__/distribution.integration.spec.ts

interfaces:

- `resolveTargetTechnicians(database, target)` — a user target is one active user
- `distributeTicket` names the technician of a user target in `offered_to_user_id`

## Task

1. `resolveTargetTechnicians()` resolves a user target: the user of the
   installation, if the account is active. A deactivated account is nobody, so
   the distribution changes nothing — the rule of an empty pool (§7.14).
2. The offer of a user target names the technician in `offered_to_user_id`, so
   the ticket waits for him (§7.14); a pool target keeps the on-call person and
   its timeout.
3. Prove the user target in the integration test of the distribution: the
   technician becomes an assignee of the ticket and is notified.

## Non-goals

- No change of the contract (WP-M14-150a) and of the workflow (WP-M14-150c).
- No administration (WP-M14-150d).
- No per-user routing of the channels other than ntfy.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test proves the user target.

## Handoff

- Files changed: the distribution and its test
- Interfaces added: the user target of a distribution
- Verified: —
- Follow-up WP: WP-M14-150c (the workflow), WP-M14-150d (the administration)
- Open question: none
