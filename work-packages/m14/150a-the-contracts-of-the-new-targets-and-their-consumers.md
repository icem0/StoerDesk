# WP-M14-150a: the contracts of the new targets and their consumers

format: small-model
status: planned
depends-on: WP-M14-150
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5, §7.14
spec-lines: 40

files-read:

- packages/shared/src/schemas/escalation-config.ts (the target contracts)
- packages/shared/src/__tests__/escalation-config.test.ts (the contract test)
- apps/api/src/escalation/config.ts (the target of an action)
- apps/api/src/escalation/actions.ts (the dispatcher of the actions)

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts
- apps/api/src/escalation/config.ts
- apps/api/src/escalation/actions.ts

interfaces:

- `escalationTargetSchema` — `{ kind: 'pool' | 'group' | 'user', id: uuid }`
- `escalationNotifyTargetSchema` — `{ kind: 'user' | 'pool', id: uuid }` or `{ kind: 'assigned' }`
- the `notify` action with the target `assigned` — the assignees of the ticket

## Task

1. The target of the `offer` and the `assign` action gains the kind `user`: one
   row of `users` of the installation. The jsonb of the action carries no
   foreign key, so the configuration service checks the id.
2. The target of the `notify` action becomes a union: a target with an id
   (`user`, `pool`) and the target `assigned` without an id.
3. The configuration service writes the kind `assigned` without an id and
   checks a user target against `users`; the kind `assigned` is never checked.
4. The dispatcher resolves the target `assigned`: the assignees of the ticket
   (`ticket_assignees`) receive the notification on their own ntfy topic. A
   ticket without an assignee reaches nobody.
5. Extend the contract test with the new kinds and the shape without an id.

## Non-goals

- No distribution of a named technician: the engine of the `user` target
  follows in WP-M14-150b.
- No workflow change (WP-M14-150c) and no administration (WP-M14-150d).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the shared contract test passes with the new kinds and
the existing escalation tests stay green.

## Handoff

- Files changed: the shared escalation contract, its test, the configuration
  service and the dispatcher of the actions
- Interfaces added: the kind `user` of the target of a distribution, the kind
  `assigned` of the target of a notification
- Verified: —
- Follow-up WP: WP-M14-150b (the distribution), WP-M14-150c (the workflow),
  WP-M14-150d (the administration)
- Open question: none
