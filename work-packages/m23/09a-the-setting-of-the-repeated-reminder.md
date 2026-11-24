# WP-M23-09a: the setting of the repeated reminder

format: small-model
status: done
depends-on: WP-M23-09
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.1
spec-lines: 30

files-read:

- packages/shared/src/oncall.ts (the resolved settings of the readiness)
- packages/shared/src/schemas/oncall.ts (the contract of the settings)
- apps/api/src/oncall/settings.ts (the keys of the readiness in the database)
- apps/api/src/oncall/routes.ts (the route of the settings)

files-write:

- packages/shared/src/oncall.ts, packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/settings.ts, apps/api/src/oncall/routes.ts
- apps/api/src/oncall/__tests__/routes.integration.spec.ts
- specs/04-oncall.md

interfaces:

- `oncall.reminder_repeat_h` — the new setting: the hours between two reminders
  of a shift that was not accepted; the default is `4`, the range is `1`–`72`
- `OncallSettings.reminderRepeatH` — the resolved value

## Task

1. The sweep of the reminders needs a cadence: today it sends one reminder per
   shift and never again. The new setting `oncall.reminder_repeat_h` says how
   many hours pass between two reminders of the same shift.
2. The setting joins the keys of the readiness: the shared contract
   (`packages/shared/src/oncall.ts`, `packages/shared/src/schemas/oncall.ts`),
   the keys of the database (`apps/api/src/oncall/settings.ts`) and the route
   (`apps/api/src/oncall/routes.ts`). The default is `4` hours, the range is
   `1`–`72`, an invalid value falls back to the default like every other key.
3. Name the setting in the table of `specs/04-oncall.md` §4a.1.

## Non-goals

- No sweep yet — WP-M23-09b reads the setting.
- No form in the administration — WP-M23-09c.
- No change of the other settings.

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

- Files changed: the shared contract, the settings of the API, the route of the
  settings, its test and the spec
- Interfaces added: `oncall.reminder_repeat_h`, `OncallSettings.reminderRepeatH`
- Verified: the commands above
- Follow-up WP: WP-M23-09b, WP-M23-09c, WP-M23-09d, WP-M23-09e, WP-M23-09f
- Open question: none
