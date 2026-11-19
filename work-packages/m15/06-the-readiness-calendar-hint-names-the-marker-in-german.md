# WP-M15-06: the readiness calendar hint names the marker in German

format: small-model
status: done
depends-on: WP-M15-05
phase: 15
milestone: m15
context-budget: 10k tokens
spec: PLAN.md §3; specs/00-conventions.md §0.1
spec-lines: 10

files-read:

- apps/web/src/i18n/locales/de/oncall.json (the hint of the readiness calendar)
- apps/web/src/i18n/locales/en/oncall.json (the English counterpart)

files-write:

- apps/web/src/i18n/locales/de/oncall.json
- work-packages/README.md
- CHANGELOG.md

interfaces:

- the German hint of the readiness calendar names the marker of the current
  day in correct German

## Task

1. The hint of the readiness calendar in `apps/web/src/i18n/locales/de/oncall.json`
   carries the broken text „Der jetige Däy besonnders marked." — the
   translation of WP-M14-156 landed half-English. It names the marker now:
   „Der jetige Däy besonnders marked." → „Der jetrige Tag is specially marked."
2. `work-packages/README.md` and `CHANGELOG.md` record the fix.

## Non-goals

- No change of the English hint (it already reads "The current day is
  specially marked.").
- No change of the calendar component or of any code.

## Acceptance

```bash
npm run i18n:check
npm run check
```

Expected: green; the text carries correct German.

## Handoff

- Files changed: `apps/web/src/i18n/locales/de/oncall.json`,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: none
- Verified: `npm run i18n:check` and `npm run check`
- Follow-up WP: none
- Open question: none
