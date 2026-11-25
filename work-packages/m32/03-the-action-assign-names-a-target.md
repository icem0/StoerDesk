# WP-M32-03: the action assign names a target

format: ctx-256k
status: planned
phase: 32
milestone: m32
context-budget: 45k tokens
depends-on: WP-M32-02
spec: specs/07-escalation.md §7.14 (the assign action); docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md
spec-lines: 40
changed-lines: 260

files-read:

- apps/api/src/escalation/config.ts (the read and the write of the configuration)
- apps/api/src/escalation/actions.ts (the dispatcher)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)
- packages/shared/src/schemas/escalation-config.ts (the action `assign`)

files-write:

- apps/api/src/escalation/config.ts (the configuration of the action `assign`)
- apps/api/src/escalation/actions.ts (the dispatcher)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)

interfaces:

- the action `assign` of the escalation — `{ target: { kind, id }, acceptance: boolean }`
- `resolveAssignee(database, target): Promise<string | null>` — the first member of the target

## Task

1. The configuration reads and writes the target of the action `assign`
   instead of the mode and the technician; the target is checked against the
   rows of the installation — a readiness pool, a user group or a technician —
   and an unknown target is refused with `400 invalid_target`, the rule of the
   target of the `offer` action.
2. A stored action of the former shape keeps working until the purge: the mode
   `user` with its technician is read as a target of the kind `user`, the mode
   `pool` still takes the first member of the pool of the office.
3. The dispatcher hands the ticket to the first member of the target and
   stores the target with the assignment, so a refusal walks the same list.

## Non-goals

- No change of the interface — the editor of the action comes with WP-M32-04.
- No removal of the setting `escalation.assignee_pool` — WP-M32-05 drops it.
- No change of the offer action and of its timeout chain.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the configuration proves that an action with
a target is written and read, and that an unknown target is refused.

## Handoff

- Files changed: the three files of `files-write`, the tests of the
  configuration and of the distribution, CHANGELOG.md
- Interfaces added: the target in the action `assign` of the escalation
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`
- Follow-up WP: WP-M32-04 (the interface), WP-M32-05 (the purge of the rest)
- Open question: none
- Notes: the dispatcher resolves the members of the target over the shared
  resolution of the readiness service — the order by name.
