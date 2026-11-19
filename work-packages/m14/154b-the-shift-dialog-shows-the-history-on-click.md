# WP-M14-154b: the shift dialog shows the history on click

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.3, §4a.10; PLAN.md §8
spec-lines: 40

depends-on: WP-M14-154a

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the shift rows)
- apps/web/src/features/oncall/my-shifts-page.tsx (the own shift card)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the dialog pattern)
- apps/web/src/i18n/locales/{de,en}/oncall.json (the labels)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx
- packages/shared/src/schemas/oncall.ts (`oncallShiftHistoryEntry`)

files-write:

- apps/web/src/features/oncall/{shift-detail-dialog.tsx,readiness-calendar.tsx,my-shifts-page.tsx}
- apps/web/src/i18n/locales/{de,en}/oncall.json
- apps/web/src/features/oncall/__tests__/{readiness-calendar,my-shifts-page}.test.tsx
- apps/web/src/features/oncall/shift-detail-dialog.tsx

interfaces:

- `ShiftDetailDialog` — shift, pool name, `showNames`, `onClose`
- the calendar row and the own shift card open the dialog
- the dialog reads `GET /api/v1/oncall/shifts/:id/history`

## Task

1. Add `apps/web/src/features/oncall/shift-detail-dialog.tsx`: a modal
   (`role="dialog"`, backdrop click and Escape close) that shows the state,
   the pool, the period and the technician of the shift, then the history from
   a TanStack query (`retry: false`). Each row names the step, the local time,
   the acting person and — when the event carries one — the referenced person
   and the state transition; a decline row shows its reason. Without
   `oncall.read_names` the dialog names no person and reads the technician as
   "besetzt"/"nicht besetzt"; a missing history reads its empty text and a
   failed read its error text, never a raw code.
2. `readiness-calendar.tsx`: every shift row becomes a button that opens the
   dialog with the same shift and pool name. The existing text, colours, title
   and the name gate stay.
3. `my-shifts-page.tsx`: every own shift card gains a "Details / Verlauf"
   button that opens the same dialog; the confirm, decline, swap and cancel
   actions stay untouched.
4. `{de,en}/oncall.json`: the labels of the dialog, of the history steps
   (`shift_created`, `shift_updated` as assignment or publication, `confirmed`,
   `declined`, `swap_*`, a generic fallback), the actor, referenced person,
   state transition, reason, empty and error texts. No new text in the ticket
   namespace.
5. The calendar test clicks a shift and proves the dialog and its history rows;
   the own-shift test clicks the details button and proves the same. The
   `/history` fetch is mocked in the existing stubs.

## Non-goals

- No change of the API or the shared contract — WP-M14-154a ships both.
- No change of the write actions, the offline outbox or the iCal feed.
- No new permission and no new route in the web app.
- No history of the administration grid in this WP.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; both click targets open the dialog and it renders the
named and timed history rows, while a role without `oncall.read_names` sees no
person name.

## Handoff

- Files changed: the dialog, the calendar, the own-shift page, the two locale
  files, the two web tests, `docs/REPO-MAP.md`, `work-packages/README.md`,
  this document
- Interfaces added: `ShiftDetailDialog`, the click targets of the calendar and
  of the own shift card
- Verified: targeted web suite, typecheck, lint, `npm run i18n:check`,
  `npm run wp:check`
- Follow-up WP: none
- Open question: none
