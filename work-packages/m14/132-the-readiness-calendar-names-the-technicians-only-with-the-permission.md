# WP-M14-132: The readiness calendar names the technicians only with the permission

format: small-model
status: done
depends-on: WP-M14-131
phase: 14
milestone: m14
context-budget: 14k tokens
spec: PLAN.md §8; specs/01-rbac.md §3.3, §3.7; specs/04-oncall.md §4a.2
spec-lines: 60

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the month grid)
- apps/web/src/features/oncall/my-shifts-page.tsx (the page that passes the shifts)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx (the calendar test)
- apps/web/src/auth/usePermission.ts (the UI-side permission check)
- apps/web/src/i18n/locales/de/oncall.json (`readiness.*`)
- packages/shared/src/permissions.ts (the key of WP-M14-131)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json

interfaces:

- `ReadinessCalendar({ shifts, pools, showNames })` — the new optional prop
  `showNames`; `false` hides the names of the technicians
- `oncall.readiness.assigned` — "besetzt" / "staffed"
- `oncall.readiness.pageHintWithoutNames` — the hint of a role without the names

## Task

WP-M14-131 put the key `oncall.read_names` into the catalog. The gate in the
web app follows: the readiness calendar of `/oncall` reads the permission and
hides the names of the technicians from every role without it.

1. `readiness-calendar.tsx`: the component takes the prop `showNames` (default
   `true`). With `showNames` false the browser asks for **no** member of a pool
   at all — the query of the pool members is not started — and the row of a
   shift answers `oncall.readiness.assigned` ("besetzt") when the shift has a
   technician and `oncall.readiness.unassigned` ("nicht besetzt") when the slot
   is empty. The state label, the coloured dot, the colour of the day and the
   pool name stay; the `title` of the row carries the same three things.
2. `my-shifts-page.tsx`: the page reads the permission with `usePermission`
   (`oncall.read_names`) and passes it to the calendar; the hint of the page
   answers `oncall.readiness.pageHintWithoutNames` for a role without the
   names, so it never promises names it does not show.
3. `de/oncall.json` and `en/oncall.json`: the two new keys — `readiness.assigned`
   ("besetzt" / "staffed") and `readiness.pageHintWithoutNames`.
4. `readiness-calendar.test.tsx` and `my-shifts-page.test.tsx`: a case without
   the permission proves that the row names nobody ("besetzt"), that a slot
   without a technician still answers "nicht besetzt" and that the browser
   fetches no member; the page test grants the permission where it expects the
   name of a technician.

## Non-goals

- No change of the API: the members of a pool are still answered to
  `oncall.read` (`specs/04-oncall.md` §4a.2) — the candidates of a swap need
  them, and the swap form of the own readiness keeps its colleague names.
- No change of the own readiness, of the iCal feed and of the administration
  page `/admin/oncall`.
- No change of the ticket view: the assignees of a ticket
  (`specs/08-objects-api.md`, WP-M14-85) keep their names.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change (the row names the
technician) and pass after it.

## Handoff

- Files changed: `apps/web/src/features/oncall/readiness-calendar.tsx`,
  `apps/web/src/features/oncall/my-shifts-page.tsx`,
  `apps/web/src/i18n/locales/de/oncall.json`,
  `apps/web/src/i18n/locales/en/oncall.json`, the two tests, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `docs/REPO-MAP.md`, `PLAN.md` §16
- Interfaces added: `ReadinessCalendar({ shifts, pools, showNames })`,
  `oncall.readiness.assigned`, `oncall.readiness.pageHintWithoutNames`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0
  errors, 13 pre-existing warnings), `npm run test:run` (1418 tests, 205 files),
  `npm run i18n:check` (1617 keys in `de` and `en`), `npm run wp:check` (555
  small-model WP, 0 failed)
- Follow-up WP: none
- Open question: none
