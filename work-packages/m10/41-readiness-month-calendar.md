# WP-M10-41: the readiness calendar as a two-month grid

format: small-model
status: planned
depends-on: WP-M10-33, WP-M10-34
phase: 10
milestone: m10
context-budget: 20k tokens
spec: PLAN.md §8; specs/04-oncall.md §4a.2, §4a.3
spec-lines: 60

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the current week list)
- apps/web/src/features/oncall/my-shifts-page.tsx (the page that passes the shifts)
- apps/web/src/features/oncall/__tests__/my-shifts-page.test.tsx (the page test)
- apps/web/src/i18n/locales/de/oncall.json (the on-call labels)
- apps/web/src/i18n/locales/en/oncall.json (the on-call labels)
- specs/04-oncall.md (§4a.2 pools, §4a.3 shifts)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json

interfaces:

- `ReadinessCalendar({ shifts, pools })` — unchanged signature, now a month grid
- `oncall.readiness.weekColumn`, `oncall.readiness.previous`, `oncall.readiness.next`,
  `oncall.readiness.empty` — the labels of the grid in `de` and `en`
- no API change and no new route

## Task

The office wants a real calendar instead of the list of one week.

1. `ReadinessCalendar` renders the current and the following month as two
   month grids, one below the other, each with its own month heading. The
   previous and next buttons move the two-month window by one month; the first
   window starts with the current month in `Europe/Berlin`.
2. Every month grid is a table: the first column carries the ISO calendar
   week number, the next seven columns are Monday through Sunday, so every
   week is exactly one row. Days of the neighbouring month stay in the grid
   but are muted and carry no shifts.
3. A day with shifts is coloured by their state: `CONFIRMED` green,
   `PLANNED` amber, `SWAP_REQUESTED` purple, `DECLINED` and `UNFILLED` rose,
   `DRAFT` slate. A legend names every colour with its state label
   (`oncall.admin.state.*`). A day with several shifts takes the state that
   needs attention first in the order declined/unfilled, swap, planned,
   draft, confirmed.
4. Every shift in a day names its technician (from the pool members) or
   `oncall.readiness.unassigned`; the pool name and the state stay in the
   cell's `title`.
5. All UI text comes from `oncall.readiness.*` and `oncall.admin.state.*` in
   `de` and `en`; no literal string in the component.

## Non-goals

- No change of the on-call API, the routes, the shift actions or the
  administration page `/admin/oncall`.
- No change of `MyShiftsPage` and the own readiness.
- No new dependency and no third-party calendar library.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the calendar test finds two month tables, the week-number
column, seven weekday columns and the state legend.

## Handoff

- Files changed: the calendar component, its test, both on-call locale files
- Interfaces added: `oncall.readiness.weekColumn`; `previous`/`next` now name months
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
