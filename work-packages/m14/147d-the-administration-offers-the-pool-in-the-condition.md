# WP-M14-147d: the administration offers the pool in the condition

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.4, §7.5; apps/web/src/admin/escalation-condition-builder.tsx
spec-lines: 45

depends-on: WP-M14-147c

files-read:

- apps/web/src/admin/escalation-condition-builder.tsx (the builder of a condition)
- apps/web/src/admin/escalation-page.tsx (the page, the pool targets)
- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)
- apps/web/src/i18n/locales/de/settings.json (the labels of the conditions)

files-write:

- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json

interfaces:

- the field `shift` in the builder of a condition — the value is a readiness
  pool chosen from the list of the administration
- `admin.escalation.condition.fields.shift` — „Bereitschafts-Schicht" /
  „Readiness shift"

## Task

1. `apps/web/src/admin/escalation-condition-builder.tsx`: the builder gains the
   list of the readiness pools as the property `pools`. The value of the field
   `shift` is a select over that list, not a text field — the name of the pool
   is what the office reads. The builder reads the pools of the page, so no
   second request leaves the browser.
2. `apps/web/src/admin/escalation-page.tsx` and
   `apps/web/src/admin/escalation-action-editor.tsx`: both hand the pools to
   the builder — the rule form and the condition of an action.
3. `apps/web/src/i18n/locales/{de,en}/settings.json`: the field `shift` gets its
   label in both languages.

## Non-goals

- No new page and no new hook: the pools are already in the page.
- No change of the other fields of the condition builder.
- No translation of the name of a pool: the name is the name of the
  installation (§3.1).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the builder shows the pools for the field `shift` and the
i18n check finds both languages.

## Handoff

- Files changed: the builder of a condition, the page, the editor of the
  actions, the two locale files, the test, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: the select of the pool in the condition builder
- Verified: `npm run check`
- Follow-up WP: none
- Open question: none
