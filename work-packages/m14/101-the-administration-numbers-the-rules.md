# WP-M14-101: the administration numbers the rules

format: small-model
status: done
depends-on: WP-M14-100
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.5, §7.11
spec-lines: 12

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

interfaces:

- a rule of a stage shows its number `#1` in a read-only field instead of an
  editable key
- the label of the number is `admin.escalation.rule.number`

## Task

1. Replace the key field of a rule with a read-only field that carries the
   number of the rule inside its stage (`#1`, `#2`); the key of the rule is the
   identity of the server (WP-M14-100) and is no longer editable.
2. Add the label of the number in `de` and `en`.
3. Prove the number of the rule in the rule editor test: the field shows `#1`,
   it is read-only and the only key field of the page is the key of the stage.

## Non-goals

- No change of the action editor — the actions are numbered in WP-M14-102.
- No change of the key of a stage, which stays editable when the stage is
  created.
- No change of the values of a rule.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the rule editor passes (6/6).

## Handoff

- Files changed: the escalation page, the two locale files, the rule editor test
  and the repository bookkeeping
- Interfaces added: the number of a rule
- Verified: the rule editor 6/6, the stage tab 4/4
- Follow-up WP: WP-M14-102 (the action editor numbers the actions)
- Open question: none
