# WP-M14-81: the shared contracts of the offer and assign actions

format: small-model
status: planned
depends-on: WP-M14-80
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 40

files-read:

- packages/shared/src/schemas/escalation-config.ts (`ESCALATION_ACTION_TYPES`, `escalationActionConfigSchema`)
- packages/shared/src/schemas/ticket.ts (`ticketStatusKeySchema` — the shape of a key)
- packages/shared/src/index.ts (the exports of the package)
- packages/shared/src/__tests__/escalation.test.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation.test.ts

interfaces:

- `ESCALATION_ACTION_TYPES` carries `offer` and `assign`
- `escalationTargetSchema` — `{ kind: 'pool' | 'group', id: uuid }`
- `escalationActionConfigSchema` gains the two variants with their `target`

## Task

1. `packages/shared/src/schemas/escalation-config.ts`: the union
   `escalationTargetSchema` — `{ kind: z.enum(['pool', 'group']), id: z.uuid() }`
   — and the two new variants of `escalationActionConfigSchema`:
   `{ key, type: 'offer', target, condition }` and
   `{ key, type: 'assign', target, condition }`. `ESCALATION_ACTION_TYPES` gains
   the two types, so the administration offers them.
2. The contract rejects a target without a kind and without a uuid — the
   configuration service of WP-M14-83 checks that the target names an existing
   pool or group.
3. `packages/shared/src/__tests__/escalation.test.ts`: the unit test proves that
   a valid offer action parses, that a target without a kind or with a malformed
   id is rejected and that the two new types are in the type list.

## Non-goals

- No service, no UI (WP-M14-82 … WP-M14-85).
- No change of the existing four action types.
- No new shared type for the assignees — the ticket view reads them in WP-M14-85.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new unit test fails before the change and passes
after it.

## Handoff

- Files changed: the shared schema, the unit test
- Interfaces added: `escalationTargetSchema`, the two action variants
- Verified:
- Follow-up WP: WP-M14-82 (the engine)
- Open question: none
