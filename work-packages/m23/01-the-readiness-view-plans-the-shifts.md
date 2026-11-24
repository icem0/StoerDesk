# WP-M23-01: the readiness view plans the shifts and shares the calendar

format: small-model
status: done
depends-on: WP-M22-01
phase: 23
milestone: m23
context-budget: 24k tokens
spec: specs/04-oncall.md §4a.3, §4a.7
spec-lines: 40

files-read:

- specs/04-oncall.md (the readiness slice)
- apps/web/src/features/oncall/my-shifts-page.tsx (the readiness view)
- apps/web/src/features/oncall/readiness-calendar.tsx (the calendar of the office)
- apps/web/src/admin/oncall-page.tsx (the administration of the readiness)
- apps/web/src/features/oncall/__tests__/my-shifts-page.test.tsx (the test of the readiness view)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx, apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/features/oncall/planning-section.tsx, apps/web/src/admin/oncall-page.tsx
- apps/web/src/features/oncall/__tests__/my-shifts-page.test.tsx, apps/web/src/admin/__tests__/oncall-page.test.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json, specs/04-oncall.md, docs/REPO-MAP.md, work-packages/README.md, PLAN.md

interfaces:

- `ReadinessCalendar({ shifts, pools, showNames?, icalUrl? })` — the frame of the
  calendar carries the share button; the button copies the personal iCal URL
  into the clipboard and names the result
- `PlanningSection({ pools, defaultPoolId, mayPlan, mayAdmin })` — the weekly
  plan of the readiness inside the readiness view: generate the slots of a week
  (`oncall.plan`), assign or reassign a technician, publish a draft and delete
  a slot that did not start (`oncall.admin`)

## Task

1. Remove the section „Kalender-URL“ from the readiness view: the readiness
   calendar of the office carries the share button in the upper right corner of
   its frame instead. The button copies the URL of the personal iCal feed into
   the clipboard and names the result („Kalender-URL kopiert“). The URL is
   still read through `GET /api/v1/oncall/ical-url`, so the token never leaves
   the route as a value the page could log.
2. Move the weekly plan out of the administration at `/admin/oncall` into the
   readiness view at `/oncall`: the new `PlanningSection` shows the pool, the
   week and the shifts of that week with their state and their technician. The
   candidates of the assignment come from
   `GET /api/v1/oncall/pools/:id/members`, so the plan needs no other right
   than the readiness itself.
3. Offer the plan only where it is allowed: the section appears with
   `oncall.plan` or `oncall.admin`, the generation needs `oncall.plan`, the
   assignment, the publication and the deletion need `oncall.admin`. The server
   guards stay the only enforcement point.
4. Make the overview of the week better: the table names the number of the
   shifts, the declined ones and the unstaffed ones, a declined shift is marked
   in the table and carries the hint that another technician is due.
5. The administration keeps the configuration — the pools, the duty blocks, the
   warnings, the swaps and the `oncall.*` settings — and links to the planning
   in the readiness view.
6. Name the change in `specs/04-oncall.md` (§4a.3, §4a.7) and in
   `docs/REPO-MAP.md`.

## Non-goals

- No change of the API, the database or the permission keys.
- No repeated reminder with a higher urgency — that is WP-M23-02.
- No change of the duty blocks of a pool; they stay in the administration.
- No change of the own shifts (confirm, decline, swap, details).

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

- Files changed: the readiness view, the calendar of the office, the new
  planning section, the administration of the readiness, the locales, the spec,
  the module map and the plan
- Interfaces added: `PlanningSection`, the property `icalUrl` of the
  `ReadinessCalendar`
- Verified: the commands above
- Follow-up WP: WP-M23-02 — the repeated reminder with a higher urgency
  (`work-packages/m23/02-the-repeated-reminder-of-a-declined-shift.md`)
- Open question: none
