# WP-M14-112: the condition builder shows the mode below the conditions

format: small-model
status: done
depends-on: WP-M14-111
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.4
spec-lines: 20

files-read:

- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

files-write:

- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

interfaces:

- the mode of a condition (`all` or `any`) stands below its conditions
- the mode is only shown when at least one condition is set
- every condition carries its own remove button — the condition builder deletes
  a chosen condition, not only the last one

## Task

1. Move the mode of the conditions (`all` or `any`) below the conditions and
   show it only when at least one condition is set: without a condition there
   is nothing to combine.
2. Give every condition its own remove button, so a chosen condition is
   deleted and the other ones stay; the button below the list that deleted the
   last condition only is gone.
3. Let the label `admin.escalation.condition.remove` take the number of the
   condition in `de` and `en`.
4. Prove both in the rule editor test: the mode appears with the first
   condition and stands below the conditions, and the first of two conditions
   can be deleted.

## Non-goals

- No change of the evaluation of a condition — the shared contract of §7.4
  stays.
- No change of the fields and the operators of a condition.
- No change of the action editor.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the rule editor passes (8/8).

## Handoff

- Files changed: the condition builder, the two locale files, the rule editor
  test and the repository bookkeeping
- Interfaces added: the remove button of a condition
- Verified: the rule editor 8/8, the web suite
- Follow-up WP: WP-M14-113 (the shared contract knows the stage NEW)
- Open question: none
