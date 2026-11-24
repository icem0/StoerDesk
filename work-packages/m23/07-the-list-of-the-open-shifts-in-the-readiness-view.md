# WP-M23-07: the list of the open shifts in the readiness view

format: small-model
status: done
depends-on: WP-M23-06
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.3, §4a.6
spec-lines: 40

files-read:

- apps/web/src/features/oncall/my-shifts-page.tsx (the readiness view)
- apps/web/src/features/oncall/shift-admin-actions.tsx (the actions of the admin)
- apps/web/src/features/oncall/shift-detail-dialog.tsx (the dialog of one shift)
- apps/web/src/features/oncall/readiness-calendar.tsx (the calendar of the office)

files-write:

- apps/web/src/features/oncall/open-shifts-section.tsx, apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/features/oncall/__tests__/open-shifts-section.test.tsx
- work-packages/m23/07-the-list-of-the-open-shifts-in-the-readiness-view.md, work-packages/README.md, PLAN.md, CHANGELOG.md

interfaces:

- `OpenShiftsSection({ shifts, pools })` — the shifts of the readiness view that
  wait for a decision: every row opens the dialog of the shift with the actions
  of the admin (WP-M23-06)

## Task

1. The admin of the readiness saw the open shifts only where they happened to
   be: the calendar of the office shows the month, the weekly plan shows one
   week. A shift that was offered and never accepted in the week of last
   Tuesday is in neither of them.
2. The new section `OpenShiftsSection` lists the shifts that wait for a
   decision: every shift that is neither confirmed nor swapped — `UNFILLED`,
   `DRAFT`, `PLANNED` and `DECLINED` — inside a horizon of four weeks back and
   fourteen weeks ahead. The list is fed by the shifts the readiness view loads
   anyway, so no new route is needed.
3. Every row names the pool, the period, the state and the technician, and
   opens the dialog of the shift on a click — with the actions of the admin
   (WP-M23-06). The list is visible with `oncall.admin`; the names of the
   technicians follow `oncall.read_names`.
4. The texts in `de` and `en`.

## Non-goals

- No new route and no new query — the list reads the shifts of the view.
- No change of the calendar and of the weekly plan.
- No button „Erinnern" — WP-M23-09d carries it.

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

- Files changed: the new section, the readiness view, the locales, the test and
  the bookkeeping
- Interfaces added: `OpenShiftsSection`
- Verified: the commands above
- Follow-up WP: WP-M23-08, WP-M23-09d
- Open question: none
