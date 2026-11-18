# WP-M14-150d: the administration names the technician and the assigned recipient

format: small-model
status: done
depends-on: WP-M14-150a, WP-M14-150b, WP-M14-150c
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5, §7.14
spec-lines: 30

files-read:

- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)
- apps/web/src/admin/escalation-page.tsx (the queries of the page)
- apps/web/src/admin/**tests**/escalation-actions-editor.test.tsx (the test)
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/**tests**/escalation-actions-editor.test.tsx

interfaces:

- the kind select of an `offer` and an `assign` action offers `user`
- the kind select of a `notify` action offers `assigned`
- the labels `admin.escalation.action.targetKinds.assigned` and
  `admin.escalation.action.targetAssigned`

## Task

1. The kind select of the `offer` and the `assign` action offers the kind
   `user` beside `pool` and `group`; the target select then offers the users
   of the installation with their names — the list the page already reads for
   the target of a notification.
2. The kind select of the `notify` action offers the kind `assigned`: the
   recipient is the technician of the ticket, so the target select is replaced
   by a hint and the saved action carries the kind without an id.
3. The German and the English labels.
4. Prove the new kinds and the saved shape in the test of the action editor.

## Non-goals

- No change of the API and of the contract (WP-M14-150a).
- No change of the other action types.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action editor test proves the technician and the
assigned recipient.

## Handoff

- Files changed: the action editor, both settings locales, the page test
- Interfaces added: the kind `user` of a distribution, the kind `assigned` of a
  notification
- Verified: web typecheck, ESLint, vitest (the action editor 14/14),
  `i18n:check` (1698 keys in de and en), `wp:check`
- Follow-up WP: none — the feature of the office is closed
- Open question: none
