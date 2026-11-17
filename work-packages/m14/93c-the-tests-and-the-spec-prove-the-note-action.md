# WP-M14-93c: the tests and the spec prove the note action

format: small-model
status: done
depends-on: WP-M14-93b
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.6, §7.7
spec-lines: 20

files-read:

- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
- specs/07-escalation.md

files-write:

- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
- specs/07-escalation.md

interfaces:

- the configuration API answers the generated key of a keyless history action
- the action editor test proves that a note action carries no key
- the spec names the comment of a history action and its internal key

## Task

1. Prove in the configuration integration test that a body without a history
   key is stored with a generated `note_…` key.
2. Prove in the action editor test that the key field of a note action is gone
   and that the saved body carries no key.
3. Describe the note action in the spec: the comment instead of the escalation
   note, the optional key and the internal name of the action.

## Non-goals

- No change of the contract, of the service or of the administration.
- No change of the database.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action editor test passes (10/10).

## Handoff

- Files changed: the configuration integration test, the action editor test,
  the spec and the repository bookkeeping
- Interfaces added: none — the feature is complete
- Verified: `npm run check`
- Follow-up WP: WP-M14-94 (the time sequence of a rule gets its own frame)
- Open question: none
