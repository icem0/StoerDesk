# WP-M14-25: stage names label the reached-stage condition values

format: small-model
status: planned
depends-on: WP-M14-24
phase: 14
context-budget: 14k tokens
spec: specs/07-escalation.md (§7.4 conditions), PLAN.md §3.1
spec-lines: 30

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

interfaces:

- `EscalationConditionBuilder` accepts an optional `stageNames` prop
  (`Record<string, string>`); a `stageReached` leaf shows the live stage name
  of the interface language, with the raw stage key as fallback
- `RuleForm` resolves the stage names once from the configuration and
  forwards them to the condition builder

## Task

1. In `escalation-page.tsx`, resolve the stage name of the interface language
   for every stage (`names[language] ?? names.de ?? key`) and pass the map as
   `stageNames` to `RuleForm`.
2. In `escalation-condition-builder.tsx`, accept the optional `stageNames`
   prop; `stageReached` values are offered as select options labelled with the
   live stage names instead of the raw stage keys; all other fields keep their
   behaviour from WP-M14-23.
3. Extend `escalation-page-localization.test.tsx` with a rule whose condition
   matches `stageReached` and assert the translated stage name appears as a
   value option in `de` ("Prüfung") and `en` ("Review").

## Non-goals

- No locale keys: stage names are configuration data maintained in the
  "Stufen & Regeln" tab, not static translations.
- No API, schema or migration change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the extended test fails before the change and passes
after it.

## Handoff

- Files changed: page, condition builder, the localization test
- Interfaces added: optional `stageNames` prop
- Verified: typecheck, lint, localization test, i18n check, wp:check
- Follow-up WP: none
- Open question: none
