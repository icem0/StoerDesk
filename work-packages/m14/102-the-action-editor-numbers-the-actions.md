# WP-M14-102: the action editor numbers the actions

format: small-model
status: done
depends-on: WP-M14-101
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 10

files-read:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx

interfaces:

- an action of a rule shows its number `#1` in a read-only field instead of an
  editable key
- the label of the number is `admin.escalation.action.number`

## Task

1. Replace the key field of an action with a read-only field that carries the
   number of the action inside its rule (`#1`, `#2`); the key of the action is
   the identity of the server (WP-M14-100) and is no longer editable.
2. Add the label of the number in `de` and `en`.
3. Prove the number of the action and the missing key field in the action
   editor test.

## Non-goals

- No change of the configuration of an action.
- No change of the condition builder.
- No change of the rule editor (WP-M14-101).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action editor passes (11/11).

## Handoff

- Files changed: the action editor, the two locale files, the action editor test
  and the repository bookkeeping
- Interfaces added: the number of an action
- Verified: the action editor 11/11, the web suite 303/303
- Follow-up WP: WP-M14-103 (the spec and the module map name the taxonomy)
- Open question: none
