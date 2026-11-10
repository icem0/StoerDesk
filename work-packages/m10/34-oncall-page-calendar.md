# WP-M10-34: the on-call page shows the calendar and the own readiness

format: small-model
status: planned
depends-on: WP-M10-33
phase: 10
milestone: m10
context-budget: 20k tokens
spec: PLAN.md §8, §14; specs/04-oncall.md §4a.2, §4a.3
spec-lines: 60

files-read:

- apps/web/src/features/oncall/my-shifts-page.tsx (the current on-call page)
- apps/web/src/features/oncall/readiness-calendar.tsx (the calendar of WP-M10-33)
- apps/web/src/features/oncall/__tests__/my-shifts-page.test.tsx (the page test)
- apps/web/src/auth/usePermission.ts (the permission guard of the web app)
- specs/04-oncall.md (§4a.4 the self-service page)

files-write:

- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/features/oncall/__tests__/my-shifts-page.test.tsx

interfaces:

- `/oncall` — the readiness calendar, below it the own readiness, the admin button only for admins
- `usePermission('oncall.plan')` — the guard of the admin button

## Task

1. The page `/oncall` renders the readiness calendar first: every shift of
   the week with the pool, the technician and the state. The shifts of the
   signed-in user stay below it with the iCal feed, the confirmation, the
   decline and the swap requests — the own readiness.
2. The page fetches the shifts of the whole plan (it already loads them) and
   the calendar gets them together with the names of the pools; the names of
   the technicians come from the members of the pool.
3. A button to the administration of the readiness (`/admin/oncall`) is
   visible only for a user with the permission `oncall.plan`; the server
   guards remain the only enforcement point.
4. The page test asserts the order (calendar before the own readiness), the
   admin button for a user with the permission and its absence without it.

## Non-goals

- No change of the on-call API and no new route.
- No change of the administration page `/admin/oncall`.
- No change of the shift actions.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page shows the calendar and the own readiness.

## Handoff

- Files changed: the on-call page, the page test
- Interfaces added: none
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: WP-M10-35 (the menu entry) — the file exists in this commit
- Open question: none
