# WP-M23-09c: the administration sets the interval of the reminder

format: small-model
status: planned
depends-on: WP-M23-09a
phase: 23
milestone: m23
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.1
spec-lines: 30

files-read:

- apps/web/src/admin/oncall-page.tsx (the form of the settings of the readiness)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the settings)
- apps/web/src/admin/__tests__/oncall-page.test.tsx (the test of the form)

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/__tests__/oncall-page.test.tsx
- specs/04-oncall.md

interfaces:

- the field `reminderRepeatH` of the settings of the readiness — the hours
  between two reminders of a shift that was not accepted

## Task

1. The form of the settings of the readiness in the administration carries the
   keys of `specs/04-oncall.md` §4a.1. The new key `oncall.reminder_repeat_h`
   joins it: the number of hours between two reminders of a shift that was not
   accepted.
2. The field is a number between `1` and `72`; the form sends it with the
   other keys of `PUT /api/v1/settings/oncall`.
3. The texts in `de` and `en`.

## Non-goals

- No change of the other fields of the form.
- No new permission key — `settings.write` stays as it is.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the form of the settings, the locales, the test of the form
  and the spec
- Interfaces added: none — the field of the shared contract is used
- Verified: the commands above
- Follow-up WP: WP-M23-09d, WP-M23-09e, WP-M23-09f
- Open question: none
