# WP-M23-09d: the button „Erinnern" in the list of the open shifts

format: small-model
status: planned
depends-on: WP-M23-09c
phase: 23
milestone: m23
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.4
spec-lines: 30

files-read:

- apps/web/src/features/oncall/open-shifts-section.tsx (the list of the open shifts)
- apps/web/src/features/oncall/__tests__/open-shifts-section.test.tsx (the test of the list)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the readiness)

files-write:

- apps/web/src/features/oncall/open-shifts-section.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/features/oncall/__tests__/open-shifts-section.test.tsx
- specs/04-oncall.md

interfaces:

- `OpenShiftsSection({ shifts, pools, mayAdmin })` — the list of the open shifts
  of the readiness view; the button „Erinnern" of a row calls
  `POST /api/v1/oncall/shifts/:id/remind`

## Task

1. The list of the open shifts (WP-M23-07) carries the button „Erinnern" for
   a row with a technician whose shift starts later: the click sends
   `POST /api/v1/oncall/shifts/:id/remind` and the list reloads.
2. The button is visible only with `oncall.admin` — the right of the route. It
   is disabled for a shift that started and for a shift without a technician,
   with the reason in the tooltip.
3. The answer of the route that refuses the reminder (a shift that started in
   the meantime) is named in the row, not swallowed.
4. Name the texts in `de` and `en`.

## Non-goals

- No change of the list itself and of the other actions of a row.
- No new permission key — `oncall.admin` stays as it is.

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

- Files changed: the list of the open shifts, the locales, the test of the list
  and the spec
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none
- Open question: none
