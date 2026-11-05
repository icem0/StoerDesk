format: small-model
status: pending
depends-on: WP-M2-86
phase: 2
context-budget: 10k tokens
spec: PLAN.md §3.1
spec-lines: 30

files-read:

- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `object.json` (de+en): removes `list.columns.systems`, `list.systemType*`, `create.systems.*`, `edit.systems.*` keys.
- `ticket.json` (de+en): removes `report.object.system*`, `internal.create.fields.system*`, `errors.system_not_found`.

## Task

Remove system-related i18n keys from object and ticket namespaces (de and en).

1. `object.json`: drop `list.columns.systems`, `list.systemType`, `list.systemTypeAll`, `create.systems.*`, `edit.systems.*`.
2. `ticket.json`: drop `report.object.system`, `report.object.systemNone`, `report.object.noSystems`, `internal.create.fields.system`, `internal.create.fields.systemPlaceholder`, `errors.system_not_found`.

## Non-goals

- No key renames that are not removals.
- `common` namespace untouched.

## Acceptance

Run and report the exact commands:

```bash
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/i18n/locales/de/object.json`, `apps/web/src/i18n/locales/en/object.json`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Follow-up WP: WP-M2-88a (API tests part 1)
- Open question: none
