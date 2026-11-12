# WP-M13-15: The rule editor and the condition builder

format: small-model
status: done
depends-on: WP-M13-14
phase: 13
milestone: m13
context-budget: 26k tokens
spec: specs/07-escalation.md §7.3, §7.4
spec-lines: 70

files-read:

- specs/07-escalation.md §7.3, §7.4
- packages/shared/src/schemas/escalation-config.ts (the fields and the operators)
- apps/web/src/admin/escalation-page.tsx (the page of WP-M13-14)
- apps/web/src/admin/escalation-stages-page.tsx (the list pattern it replaces)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx

interfaces:

- the rule editor: the reference, the minutes per priority, the condition and the
  ordered actions of a rule
- the condition builder: `all`/`any` groups over the closed field list

## Task

1. Build the rule editor per stage: the rules of the stage with their key, their
   reference, their minutes per priority, their condition and their actions.
2. Build the condition builder: a field, an operator and a value per leaf, the
   group mode `all` or `any`, the add and the remove of a leaf and of a group;
   the field list and the operators come from the shared contract, so the form
   cannot offer an invalid combination.
3. Save the configuration with one request (`PUT /api/v1/escalation/config`) and
   show the saved state; without `settings.write` the editor stays read-only.
4. Add the German and English texts and the component test: a rule is edited,
   a condition is built, an invalid value is refused by the form.

## Non-goals

- No action editor (WP-M13-16) — the action list is read-only here.
- No new condition field and no free text field.
- No change to the shared contract.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the test proves the editor, the condition builder and the
read-only state without `settings.write`.

## Handoff

- Files changed: the page, the condition builder, the two locale files, the test
- Interfaces added: `EscalationConditionBuilder`
- Verified: typecheck, the component test, the i18n check
- Deviation: the built rule is validated with `escalationRuleConfigSchema` before the `PUT`, an invalid value never reaches the API
- Follow-up WP: WP-M13-16 — the action editor
- Open question: none
