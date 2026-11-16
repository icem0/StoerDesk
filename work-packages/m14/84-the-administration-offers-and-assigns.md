# WP-M14-84: the administration offers and assigns

format: small-model
status: planned
depends-on: WP-M14-83
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.5, §7.14
spec-lines: 45

files-read:

- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)
- apps/web/src/admin/escalation-page.tsx (the queries of the page)
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- the type select of the action editor offers `offer` and `assign`
- a target select over the pools and the groups of the installation
- the labels `admin.escalation.action.types.offer`,
  `admin.escalation.action.types.assign`, `admin.escalation.action.target` and
  `admin.escalation.action.targetKind`

## Task

1. `apps/web/src/admin/escalation-page.tsx`: read the pools of the installation
   and the groups of the administration as TanStack queries and pass them into
   the action editor — the pools over the existing route
   `GET /api/v1/oncall/pools` (WP-M8-xx), the groups over `GET /api/v1/groups`.
   A pool without a name or a group without a name is not offered.
2. `apps/web/src/admin/escalation-action-editor.tsx`: the two new types render
   a kind select (`pool` or `group`) and a target select over the pools or the
   groups of that kind; `shapeOf` and `actionOf` carry the target, and an action
   without a target is not saved.
3. The labels in `de` and `en`.
4. The page test proves the two new options, the kind select, the target select
   and the saved target of an `offer` and an `assign` action.

## Non-goals

- No change of the ticket view (WP-M14-85).
- No change of the existing four action types and of the rule editor.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the administration can add an `offer` and an `assign`
action whose target comes from the pools or the groups of the installation.

## Handoff

- Files changed: the action editor, the escalation page, the page test, the two
  locale files
- Interfaces added: the two action types in the editor with their target select
- Verified:
- Follow-up WP: WP-M14-85 (the assignees in the ticket view)
- Open question: none
