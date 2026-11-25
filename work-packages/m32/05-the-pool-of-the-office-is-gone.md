# WP-M32-05: the pool of the office is gone

format: ctx-256k
status: planned
phase: 32
milestone: m32
context-budget: 45k tokens
depends-on: WP-M32-04
spec: specs/07-escalation.md §7.14 (the retired model); docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md
spec-lines: 40
changed-lines: 380

files-read:

- packages/shared/src/schemas/escalation-config.ts (the action `assign`, the config of the escalation)
- packages/shared/src/schemas/ticket.ts (the body of the assignment)
- apps/api/src/escalation/config.ts (the read and the write of the configuration)
- apps/api/src/escalation/assignee-pool.ts (the setting of the pool of the office)
- apps/api/src/tickets/assignment.ts (the assignment service and the refusal chain)
- apps/api/src/tickets/workflow-routes.ts (the routes of the assignment)

files-write:

- packages/shared/src/schemas/escalation-config.ts (the former fields are gone)
- packages/shared/src/schemas/ticket.ts (the former fields are gone)
- apps/api/src/escalation/config.ts (the former shape is gone)
- apps/api/src/escalation/assignee-pool.ts (removed)
- apps/api/src/tickets/assignment.ts (the former chain is gone)
- apps/api/src/tickets/workflow-routes.ts (the former body is gone)
- apps/api/src/db/migrations/0066_drop_assignee_pool.sql (the setting and the stored actions)

interfaces:

- the action `assign` — `{ target: { kind, id }, acceptance: boolean }`, the target is required
- the body of the assignment — `{ target: { kind, id }, acceptance: boolean }`
- the setting `escalation.assignee_pool` — gone

## Task

1. The contract: the action `assign` requires its target; the fields `mode`,
   `user` and `assigneePool` are gone from the contract of the configuration
   and of the body of the assignment.
2. The API: the configuration reads and writes the target; the assignment
   takes the target; the route takes the target. The module of the pool of the
   office is removed with its setting, and the former chain of the refusal is
   gone — the chain walks the target of the ticket.
3. The migration `0066` drops the setting `escalation.assignee_pool` and the
   stored actions of the escalation that assigned from that pool — they cannot
   be mapped onto a target. A stored action with a technician becomes a target
   of the kind `user`.
4. The tests: the configuration without a pool of the office, the assignment
   with a target, the refusal over the members of the target.

## Non-goals

- No change of the interface — the interface knows the target since
  WP-M32-04.
- No change of the offer action and of its timeout chain.
- No data of the office that is not the pool of the office.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration drops the setting and the test of the
configuration proves that the configuration answers without a pool of the
office.

## Handoff

- Files changed: the seven files of `files-write`, the test of the
  configuration, CHANGELOG.md, docs/REPO-MAP.md
- Interfaces removed: the setting `escalation.assignee_pool`, the fields
  `mode`, `user` and `assigneePool`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`
- Follow-up WP: none — the phase is closed
- Open question: none
- Notes: a stored rule of the escalation that assigned from the pool of the
  office loses that action — the office sets a target in the administration.
