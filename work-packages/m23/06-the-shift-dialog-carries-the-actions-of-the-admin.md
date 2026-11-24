# WP-M23-06: the shift dialog carries the actions of the admin

format: small-model
status: done
depends-on: WP-M23-05
phase: 23
milestone: m23
context-budget: 22k tokens
spec: specs/04-oncall.md §4a.3, §4a.10
spec-lines: 40

files-read:

- apps/web/src/features/oncall/shift-detail-dialog.tsx (the dialog of one shift)
- apps/web/src/features/oncall/readiness-calendar.tsx (the caller of the dialog)
- apps/web/src/features/oncall/planning-section.tsx (the actions of the weekly plan)
- apps/web/src/features/oncall/use-shift-actions.ts (the mutations of a shift)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the readiness)

files-write:

- apps/web/src/features/oncall/shift-admin-actions.tsx, apps/web/src/features/oncall/shift-detail-dialog.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/features/oncall/__tests__/shift-admin-actions.test.tsx
- work-packages/m23/06-the-shift-dialog-carries-the-actions-of-the-admin.md, work-packages/README.md, PLAN.md, CHANGELOG.md

interfaces:

- `ShiftAdminActions({ shift, onChanged })` — the actions of the admin for one
  shift: assign a technician, publish a draft, delete the shift; the component
  renders nothing for a role without `oncall.admin`
- `oncall_shift_locked` — the refusal of the delete names its reason in the
  params (`state`, `confirmed`, `started`); the texts of the interface follow

## Task

1. The dialog of a shift (`shift-detail-dialog.tsx`) shows the state, the pool,
   the period, the technician and the history — and no action at all. The admin
   reaches the dialog from the calendar and finds nothing to do there.
2. The new component `ShiftAdminActions` carries the actions of the admin for
   one shift: „Neu zuweisen" (a technician of the pool, the shift is published
   again), „Veröffentlichen" (a draft) and „Löschen" (with a confirmation).
   The component renders nothing without the permission `oncall.admin` — the
   server guards the writes anyway, the interface only shows what the role may
   do.
3. The candidates of the assignment come from
   `GET /api/v1/oncall/pools/:id/members` — the members of the pool of the
   shift, so the admin needs no other right than the readiness itself.
4. The refusal of the delete names its reason: the answer of the API carries
   `state`, `confirmed` or `started` in the params of `oncall_shift_locked`, and
   the interface shows the matching text instead of one generic refusal.
5. The texts in `de` and `en`.

## Non-goals

- No change of the API and of the rules of the delete (WP-M23-05).
- No change of the history of the shift and of the dialog itself.
- No list of the open shifts — WP-M23-07 carries it.

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

- Files changed: the new component of the admin actions, the dialog, the
  locales, the test and the bookkeeping
- Interfaces added: `ShiftAdminActions`
- Verified: the commands above
- Follow-up WP: WP-M23-07, WP-M23-08
- Open question: none
