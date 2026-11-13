# WP-M14-23: the escalation condition values speak the interface language

format: small-model
status: planned
depends-on: WP-M13-18
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md (§7.4 conditions, §7.5 actions), PLAN.md §3.1
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

files-write:

- apps/web/src/admin/escalation-condition-builder.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

interfaces:

- `EscalationConditionBuilder` renders the value of a closed-vocabulary field (`priority`, `status`, `source`, `systemType`, `assigned`, `paused`) as a localized select (single for `eq`/`ne`, multi for `in`/`notIn`) whose option texts are translated; `stageReached` shows its raw key until WP-M14-24 supplies live stage names
- locale keys `admin.escalation.condition.values.{priority,status,source,systemType}.{*}`, `admin.escalation.condition.boolean.{true,false}` and the repaired German labels of `admin.escalation.condition.{modeLabel,mode.{all,any},field,operator,value,add,remove}`, `admin.escalation.rule.{reference,percent,referenceEvents.*}`, `admin.escalation.action.{type,channels,endpoints,add,remove}`, `admin.escalation.stage.{on,off}`, `admin.escalation.hint`

## Task

1. Finish the German translations of `apps/web/src/i18n/locales/de/settings.json` for the escalation section (all remaining English leftovers: condition mode/field/operator/value labels, operators, rule reference/percent/reference events, action type/channels/endpoints/add/remove, stage on/off, page hint) and add the missing condition value vocabularies (priority, status, source, systemType, boolean true/false) in `de` and `en`.
2. In `escalation-condition-builder.tsx`, render the value of a closed-vocabulary field as a localized select with translated option texts (single select for `eq`/`ne`, multi select for `in`/`notIn`); keep the free text input for `objectExternalType` and the number inputs for `deadlinePercent`/`elapsedMinutes`; `stageReached` keeps its raw key (its labels are configuration data maintained in the "Stufen & Regeln" tab and come live in WP-M14-24).
3. Extend `escalation-page-localization.test.tsx` so it asserts that condition value options are translated in `de` and `en` (e. g. `critical` → "Kritisch"/"Critical", `NEW` → "Neu"/"New", `QR` → "QR-Code"/"QR") and that no raw vocabulary key is left among the rendered options.

## Non-goals

- No API, schema or migration change; saved payloads keep their technical keys.
- `stageReached` does not show live stage names yet (WP-M14-24).
- Webhook endpoint ids stay raw ids; no language switcher.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the extended localization test fails before the change and passes after it.

## Handoff

- Files changed: condition builder, the two locale files, the localization test
- Interfaces added: localized value selects in the condition builder
- Verified: typecheck, lint, localization test, i18n check, wp:check
- Follow-up WP: WP-M14-24 (live stage names for `stageReached` and explanation texts on the page)
- Open question: none
