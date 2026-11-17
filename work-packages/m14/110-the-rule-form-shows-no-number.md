# WP-M14-110: the rule form shows no number

format: small-model
status: done
depends-on: WP-M14-109
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.3, §7.5
spec-lines: 24

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

- the rule of a stage shows no number — a stage carries one rule
- the label `admin.escalation.rule.number` is gone

## Task

1. Remove the number field of the rule form: a stage carries one rule, so the
   number of the rule says nothing to the administrator.
2. Remove the label of the number in `de` and `en`.
3. Prove in the rule editor test that the rule form shows no number and that
   the only key field of the page is the key of the stage.

## Non-goals

- No change of the keys of the rules — the server names them (WP-M14-100).
- No change of the action editor — the number of an action becomes a label in
  WP-M14-111.
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
- Interfaces added: none — the rule form shows no number
- Verified: the rule editor 6/6, the stage tab 5/5
- Follow-up WP: WP-M14-111 (the action editor shows the number as a label)
- Open question: none
