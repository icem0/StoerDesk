# WP-M14-93a: the note action carries no key

format: small-model
status: done
depends-on: WP-M14-92
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 12

files-read:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/config.ts
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/e2e/workflow.spec.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/config.ts
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/e2e/workflow.spec.ts

interfaces:

- the key of a `history` action is optional in the shared contract
- the configuration service names a keyless history action `note_…`
- the action editor hides the key field of a history action and sends no key
- the audit trail of the workflow E2E counts the escalation event of the first
  stage (WP-M14-91)

## Task

1. Make the key of the `history` variant of the action union optional and keep
   the key of every other action mandatory.
2. Assign the key in the configuration service when the body omits it.
3. Hide the key field of a history action in the action editor, send no key for
   it and keep the key of the other actions.
4. Count the escalation event of the first stage in the audit trail of the
   workflow E2E, which WP-M14-91 added to the history of every new ticket.

## Non-goals

- No change of the dispatcher — the note is still an `escalation_note` until
  WP-M14-93b.
- No change of the ticket history rendering.
- No new field in the database.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run test:e2e
```

Expected: all green; the workflow E2E passes (14/14).

## Handoff

- Files changed: the shared contract, the configuration service, the action
  editor, the workflow E2E and the repository bookkeeping
- Interfaces added: the keyless history action
- Verified: `npm run check`, the workflow E2E 14/14
- Follow-up WP: WP-M14-93b (the note action writes a ticket comment)
- Open question: none
