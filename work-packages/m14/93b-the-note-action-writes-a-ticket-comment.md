# WP-M14-93b: the note action writes a ticket comment

format: small-model
status: done
depends-on: WP-M14-93a
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.7
spec-lines: 10

files-read:

- apps/api/src/escalation/actions.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts
- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts

files-write:

- apps/api/src/escalation/actions.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts
- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts

interfaces:

- a fired `history` action writes one `comment` event with `{ text }` and the
  actor `system` instead of an `escalation_note` event

## Task

1. Write the configured text of a history action as a normal ticket comment
   with the actor `system` and the payload `{ text }`.
2. Skip the action when it carries no text.
3. Prove the comment in the action integration test and in the phase 13 exit
   criterion; the `escalation_note` events of `status_change`, `offer` and
   `assign` stay untouched.

## Non-goals

- No change of the ticket history rendering.
- No change of the other actions.
- No new field in the database.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action integration suite and the phase 13 exit
criterion pass.

## Handoff

- Files changed: the dispatcher, its integration test, the phase 13 exit
  criterion and the repository bookkeeping
- Interfaces added: the comment of a history action
- Verified: `npm run check`
- Follow-up WP: WP-M14-93c (the tests and the spec prove the note action)
- Open question: none
