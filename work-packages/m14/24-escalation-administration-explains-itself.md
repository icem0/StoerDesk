# WP-M14-24: the escalation administration explains itself

format: small-model
status: planned
depends-on: WP-M14-23
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md (§7.4 conditions, §7.5 actions, §7.9 API), PLAN.md §3.1
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

interfaces:

- locale keys `admin.escalation.help.deadlines`, `admin.escalation.help.stages`,
  `admin.escalation.help.reference`, `admin.escalation.help.condition`,
  `admin.escalation.help.actions` in `de` and `en`

## Task

1. Add multilingual explanation texts to `apps/web/src/admin/escalation-page.tsx`:
   under the deadlines grid (`admin.escalation.help.deadlines`), under the
   stage list (`admin.escalation.help.stages`), beside the rule reference
   (`admin.escalation.help.reference`), above the condition builder
   (`admin.escalation.help.condition`) and above the action editor
   (`admin.escalation.help.actions`). The texts explain what a stage, a
   deadline, a start event, a condition (`all`/`any`) and the action types
   do, because the escalation configuration is complex.
2. Add the explanation texts in German and English to the settings locale
   files.
3. Extend `escalation-page-localization.test.tsx` so it asserts the help
   texts are rendered in `de` and `en`.

## Non-goals

- No `stageReached` live labels yet (they need the stage names of the
  configuration and come in WP-M14-25).
- No API, schema or migration change; no language switcher.

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

- Files changed: page, the two locale files, the localization test
- Interfaces added: help keys
- Verified: typecheck, lint, localization test, i18n check, wp:check
- Follow-up WP: WP-M14-25 (live stage names for `stageReached` values)
- Open question: none
