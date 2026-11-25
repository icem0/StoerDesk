# WP-M32-02: the assignment carries its target

format: ctx-256k
status: planned
phase: 32
milestone: m32
context-budget: 55k tokens
depends-on: WP-M32-01
spec: specs/07-escalation.md §7.14; docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md
spec-lines: 120
changed-lines: 620

files-read:

- packages/shared/src/schemas/escalation-config.ts (the action `assign`, the config of the escalation)
- packages/shared/src/schemas/ticket.ts (the body of the assignment)
- apps/api/src/tickets/assignment.ts (the assignment service and the refusal chain)
- apps/api/src/tickets/workflow.ts (the columns of the workflow)
- apps/api/src/tickets/workflow-routes.ts (the routes of the assignment)
- apps/api/src/escalation/config.ts (the read and the write of the configuration)
- apps/api/src/escalation/actions.ts (the dispatcher)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)
- apps/api/src/oncall/members.ts (the members of a pool and of a group)
- apps/api/src/db/schema.ts (the columns of a ticket)

files-write:

- packages/shared/src/schemas/escalation-config.ts (the target of the action `assign`)
- packages/shared/src/schemas/ticket.ts (the body of the assignment)
- apps/api/src/db/schema.ts (the target of the assignment)
- apps/api/src/db/migrations/0065_assignment_target.sql (the two columns)
- apps/api/src/tickets/assignment.ts (the target, the chain)
- apps/api/src/tickets/workflow.ts (the target in the columns of the workflow)
- apps/api/src/tickets/workflow-routes.ts (the routes of the assignment)
- apps/api/src/escalation/config.ts (the configuration of the action `assign`)
- apps/api/src/escalation/actions.ts (the dispatcher)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)

interfaces:

- `assignBodySchema` — `{ target: { kind, id }, acceptance: boolean }`
- `POST /api/v1/tickets/:ticketNo/assign` — the body carries the target
- `GET /api/v1/ticket-assign-targets` — the pools, the groups and the technicians of the installation
- the action `assign` of the escalation — `{ target: { kind, id }, acceptance: boolean }`
- `resolveTargetMembers(database, target): Promise<string[]>` — the members of the target, ordered by name

## Task

1. The shared contract: the action `assign` carries a `target`
   (`escalationTargetSchema`) beside its `acceptance`; the body of the
   assignment carries the same target. The former fields (`mode`, `user`,
   `userId`) stay readable until WP-M32-04 removes them — the interface of
   today still sends them.
2. The data: `tickets.assignment_target_kind` and `tickets.assignment_target_id`
   (migration `0065`); the workflow writes them from the payload of the step
   `assigned`.
3. The service: `assignTicket` takes the target, resolves its members
   (`resolvePoolMemberIds`, `resolveGroupMemberIds`, the active account of a
   user target) and hands the ticket to the first member. The refusal walks the
   target of the ticket: the member after the one who refused — the target of
   the kind `user` has no successor.
4. The routes: `POST /api/v1/tickets/:ticketNo/assign` takes the target and
   refuses an unknown target with `400 invalid_target`;
   `GET /api/v1/ticket-assign-targets` answers the pools with their members,
   the groups with their members and the technicians of the installation.
5. The escalation: the dispatcher takes the target of the action `assign` and
   the configuration reads and writes it. A stored action of the former shape
   (`mode: user` with its technician) is read as a target of the kind `user`;
   an action of the mode `pool` keeps the pool of the office until WP-M32-04
   removes it.
6. The tests: the assignment to a pool hands the ticket to the first member of
   the pool, a refusal reaches the next member of the group, a target of the
   kind `user` has no successor, and an unknown target is refused.

## Non-goals

- No change of the interface — the picker of the ticket view and the editor of
   the action come with WP-M32-03.
- No removal of the setting `escalation.assignee_pool` — WP-M32-04 drops it.
- No change of the offer action and of its timeout chain.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new integration test of the assignment proves the
chain over the members of a pool and of a group.

## Handoff

- Files changed: the ten files of `files-write`, the integration test of the
  assignment, CHANGELOG.md
- Interfaces added: `resolveTargetMembers`, the two columns of the ticket, the
  target in the body of the assignment and in the action `assign`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`
- Follow-up WP: WP-M32-03 (the interface), WP-M32-04 (the purge of the rest)
- Open question: none
- Notes: the members of the target are ordered by name — the order of the
  member list of the readiness service; the installation stores no further
  order.
