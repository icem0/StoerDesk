# WP-M23-08: a reassignment notifies the new technician

format: small-model
status: done
depends-on: WP-M23-07
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.4, specs/10-notifications.md §11.7
spec-lines: 40

files-read:

- apps/api/src/oncall/service.ts (the assignment of a shift)
- apps/api/src/notifications/outbox.ts (the rows of the outbox for a shift)
- apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts (the test of the announcement)
- specs/10-notifications.md §11.7 (the rules of the outbox)

files-write:

- apps/api/src/oncall/service.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts
- specs/04-oncall.md, work-packages/m23/08-a-reassignment-notifies-the-new-technician.md, work-packages/README.md, PLAN.md, CHANGELOG.md

interfaces:

- the target of a readiness row of the outbox carries `assignedTo` — the id of
  the technician the row belongs to
- `assignedAnnouncementQueued(executor, shiftId, userId)` — the announcement of
  the shift exists for this technician, not for another one

## Task

1. The assignment of a shift announces itself: the row of the event
   `oncall.assigned` goes to the technician (`ADR-0021`, WP-M14-28). The guard
   against a second announcement looked at the shift alone — the row of the
   first assignment was enough, so a reassignment after a decline announced
   nothing: the new technician never heard of his shift.
2. The target of a readiness row carries the id of its technician
   (`assignedTo`), so the guard can ask for the row of *this* technician. The
   guard of the second announcement in `outbox.ts` — one row per channel while
   a row of the same shift and event is `PENDING` — counts the rows of the same
   technician too.
3. A row without the field — written before this change — blocks nothing: a
   reassignment after the change reaches the new technician.
4. Name the rule in `specs/04-oncall.md` §4a.4.

## Non-goals

- No change of the channels, of their selection and of the fallback chain.
- No change of the reminder (WP-M23-09a).
- No new permission key.

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

- Files changed: the service of the shifts, the outbox, the test of the
  announcement, the spec of the readiness and the bookkeeping
- Interfaces added: the field `assignedTo` in the target of a readiness row
- Verified: the commands above
- Follow-up WP: WP-M23-09a, WP-M23-09b, WP-M23-09c, WP-M23-09d
- Open question: none
