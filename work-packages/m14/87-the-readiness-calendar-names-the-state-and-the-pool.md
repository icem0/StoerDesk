# WP-M14-87: The readiness calendar names the state and the pool of every shift

format: small-model
status: done
depends-on: WP-M10-41
phase: 14
milestone: m14
context-budget: 14k tokens
spec: PLAN.md §8; specs/04-oncall.md §4a.2, §4a.3; WP-M10-33 (the row names pool, technician, state)
spec-lines: 60

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the month grid)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx (the calendar test)
- apps/web/src/features/oncall/my-shifts-page.tsx (the page that passes the shifts)
- apps/web/src/i18n/locales/de/oncall.json (`readiness.*`, `admin.state.*`)
- specs/04-oncall.md (§4a.2 pools, §4a.3 shifts and their six states)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx

interfaces:

- `ReadinessCalendar({ shifts, pools })` — unchanged signature
- `oncall.admin.state.*` and `oncall.readiness.unassigned` — now visible on the
  row of a shift; no new key in `de` and `en`

## Task

The office reported that the readiness calendar knows only one label: the row of
a shift names its technician or answers `oncall.readiness.unassigned`
("nicht besetzt") — the state and the pool of that shift were hidden in the cell's
`title` and in a screen-reader span (WP-M10-41). A confirmed shift, a planned one
and a declined one look identical in text and the calendar cannot say which pool
it names, although the pools are selectable and `docs/REPO-MAP.md` promises that
every shift names its pool, technician and state.

1. `readiness-calendar.tsx`: the row of a shift in a day cell names, in visible
   text, its state label (`oncall.admin.state.*`), its technician or
   `oncall.readiness.unassigned` and its pool name — the row keeps the coloured
   dot of the state, the legend and the colour of the day stay as they are.
2. The `title` of the row stays informative and now carries state, pool and
   technician, so the hover names the same three things.
3. The screen-reader span of the pool name becomes visible text; the pool name is
   muted so the technician stays the readable part of the row.
4. `readiness-calendar.test.tsx`: a new case renders a `PLANNED` shift without a
   technician and asserts the state label of the row (`Geplant` beside the legend
   entry), the pool name in the row and the amber day cell; the existing cases stay.

## Non-goals

- No new i18n key, no locale change, no change of the label
  `oncall.readiness.unassigned`.
- No change of the API, of the routes, of the shift actions or of the
  administration page `/admin/oncall`.
- No change of `MyShiftsPage`, of the own readiness or of the iCal feed.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new calendar case fails before the change (the row shows
no state label) and passes after it.

## Handoff

- Files changed: `apps/web/src/features/oncall/readiness-calendar.tsx`,
  `apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx`, this
  document, `work-packages/README.md`, `CHANGELOG.md`, `docs/REPO-MAP.md`,
  `PLAN.md` §16
- Interfaces added: none new — `oncall.admin.state.*` and `oncall.readiness.unassigned`
  become visible on the row of a shift
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0
  errors, 10 pre-existing warnings), `npm run test:run` (1318 tests, 196 files —
  the calendar test of this package included), `npm run i18n:check` (1554 keys in
  `de` and `en`), `npm run wp:check` (492 small-model WP, 0 failed) and
  `npm run test:e2e` (14/14 on a throwaway database)
- Follow-up WP: none
- Open question: none
