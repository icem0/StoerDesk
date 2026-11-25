# WP-M32-02: the assignment carries its target

format: ctx-256k
status: done
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
- apps/api/src/oncall/members.ts (the members of a pool and of a group)
- apps/api/src/db/schema.ts (the columns of a ticket)

files-write:

- packages/shared/src/schemas/target.ts (the target of a distribution)
- packages/shared/src/schemas/escalation-config.ts (the target of the action `assign`)
- packages/shared/src/schemas/ticket.ts (the body of the assignment)
- apps/api/src/db/schema.ts (the target of the assignment)
- apps/api/src/db/migrations/0065_assignment_target.sql (the two columns)
- apps/api/src/db/migrations/meta/_journal.json (the migration in the journal)
- apps/api/src/tickets/assignment.ts (the target, the chain)
- apps/api/src/tickets/workflow.ts (the target in the columns of the workflow)
- apps/api/src/tickets/workflow-routes.ts (the routes of the assignment)

interfaces:

- `assignBodySchema` — `{ target: { kind, id }, acceptance: boolean }`
- `POST /api/v1/tickets/:ticketNo/assign` — the body carries the target
- `GET /api/v1/ticket-assign-targets` — the pools, the groups and the technicians of the installation
- `resolveTargetMembers(database, target): Promise<string[]>` — the members of the target, ordered by name
- `tickets.assignment_target_kind` and `tickets.assignment_target_id` — the target of the assignment of a ticket

## Task

1. The shared contract: the schema of the target moves into its own module
   (`schemas/target.ts`) — the contract of the ticket and the contract of the
   escalation both name it. The body of the assignment carries the target
   beside its `acceptance`; the former field `userId` stays readable until
   WP-M32-04 has moved the interface.
2. The data: `tickets.assignment_target_kind` and `tickets.assignment_target_id`
   (migration `0065`); the workflow writes them from the payload of the step
   `assigned`, and an assignment without a target clears the former one.
3. The service: `assignTicket` takes the target, resolves its members
   (`resolvePoolMemberIds`, `resolveGroupMemberIds`, the active account of a
   user target) and hands the ticket to the first member. A target without a
   member is nobody: the assignment is refused with `assign_target_empty`.
4. The refusal walks the target of the ticket: the member after the one who
   refused. A target of the kind `user` has no successor.
5. The routes: `POST /api/v1/tickets/:ticketNo/assign` takes the target and
   refuses an unknown target with `400 invalid_target`;
   `GET /api/v1/ticket-assign-targets` answers the pools with their members,
   the groups with their members and the technicians of the installation.
6. The tests: the assignment to a pool hands the ticket to the first member of
   the pool, a refusal reaches the next member of the group, a target of the
   kind `user` has no successor, and a target without a member is refused.

## Non-goals

- No change of the interface — the picker of the ticket view and the editor of
   the action come with WP-M32-04.
- No change of the action `assign` of the escalation — WP-M32-03 gives it the
   target.
- No removal of the setting `escalation.assignee_pool` — WP-M32-05 drops it.

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

- Files changed: the nine files of `files-write`, the integration test of the
  assignment, CHANGELOG.md, docs/REPO-MAP.md
- Interfaces added: `resolveTargetMembers`, `targetExists`,
  `readAssignTargets`, the two columns of the ticket, the target in the body
  of the assignment
- Verified: `npm run check` green (typecheck, lint, i18n, wp, the tests of the API and
  the web, the E2E of the browser) — the new integration test of the assignment
  proves the chain over the members of a group and of a readiness pool
- Follow-up WP: WP-M32-03 (the action `assign` of the escalation),
  WP-M32-04 (the interface), WP-M32-05 (the purge of the rest)
- Open question: none
- Notes: the members of the target are ordered by name — the order of the
  member list of the readiness service; the installation stores no further
  order. The former fields of the contract (`userId`, `mode`, `user`) stay
  readable until the interface has moved.
