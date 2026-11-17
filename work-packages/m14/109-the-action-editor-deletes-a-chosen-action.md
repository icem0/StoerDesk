# WP-M14-109: the action editor deletes a chosen action

format: small-model
status: done
depends-on: WP-M14-108
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 20

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

- every action of a rule carries its own remove button
- the remove button of an action names its number (`Aktion #1 entfernen`)
- the single remove button that deleted the last action is gone

## Task

1. Give every action of a rule its own remove button: it deletes that action
   and keeps the other actions of the rule.
2. Name the action in the button (`admin.escalation.action.remove` with the
   number of the action), so several buttons in one rule stay apart.
3. Remove the button below the list that deleted the last action only.
4. Prove in the action editor test that the first action of a rule can be
   deleted while the second one stays.

## Non-goals

- No change of the order of the actions and no change of their configuration.
- No change of the condition builder — its conditions are removed in
  WP-M14-112.
- No change of the service — the server replaces the actions of a rule with the
  submitted ones.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action editor passes (12/12).

## Handoff

- Files changed: the action editor, the two locale files, the action editor test
  and the repository bookkeeping
- Interfaces added: the remove button of an action
- Verified: the action editor 12/12, the web suite
- Follow-up WP: WP-M14-110 (the rule form shows no number)
- Open question: none
