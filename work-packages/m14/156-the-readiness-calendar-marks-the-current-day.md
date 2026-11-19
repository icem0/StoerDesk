# WP-M14-156: the readiness calendar marks the current day specially

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: PLAN.md §8; specs/04-oncall.md §4a.2, §4a.3

depends-on: WP-M14-155

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the month grid, the cell styles)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx (the grid tests)
- apps/web/src/i18n/locales/de/oncall.json (`readiness.hint`)
- PLAN.md §8 (the readiness calendar)
- docs/REPO-MAP.md (the calendar module row)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/i18n/locales/{de,en}/oncall.json (`readiness.hint`)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx
- PLAN.md (§8, §16), `CHANGELOG.md`, `work-packages/README.md`,
  `docs/REPO-MAP.md`, this document

interfaces:

- `ReadinessCalendar` — unchanged signature; the cell of the Berlin calendar date
  of now gains a ring and a semibold date number
- `oncall.readiness.hint` — the hint of the calendar now names the marker

## Task

**The comment of the office (out of band in phase 14).** „am bereitschaftskalender
solle der jetige Day besonnders gekennzeichnet werden".

The grid colours a day by the state of its shifts, but nothing says which day is
**today** — the office reads gaps and shifts against the wall clock and must not
count weeks.

1. `apps/web/src/features/oncall/readiness-calendar.tsx`: compute `todayIso` once
   per render with `localIsoDate(new Date())` — the Berlin calendar date, the same
   rule as the cells and the shift filter. The cell of that date keeps its state
   colour and gains `ring-sky-300 ring-1` (the palette of the on-call pages,
   distinct from every state colour); the date number of the cell reads semibold
   instead of medium. Today without a shift is still ringed — the gap of today
   must be visible.
2. `apps/web/src/i18n/locales/{de,en}/oncall.json`: `readiness.hint` names the
   marker in one added sentence; no new key.
3. `apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx`: a new
   case asserts that exactly one cell carries the ring and that its text carries
   the number of the current Berlin date; the case renders without shifts, so
   today without a shift is proven ringed as well.

## Non-goals

- No change of the state colours, of the legend, of the week numbers or of the
  month navigation.
- No new i18n key, no API change, no schema or migration.
- No marker for other dates (week starts, shift edges) — only the current day.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new calendar case fails before the change and passes
after it; the case asserts exactly one ringed cell.

## Handoff

- Files changed: `apps/web/src/features/oncall/readiness-calendar.tsx` (the ring
  of today, the semibold date number, the header comment), `apps/web/src/i18n/locales/{de,en}/oncall.json`
  (`readiness.hint` names the marker), the calendar test, `PLAN.md` §8 and §16,
  `CHANGELOG.md`, `work-packages/README.md`, `docs/REPO-MAP.md`, this document
- Interfaces added: none — `ReadinessCalendar` keeps its signature
- Verified: `npm run typecheck` (green), the readiness-calendar suite 9/9
  (`vitest` — the new ring case fails before the change), `npm run i18n:check`
  (1770 keys in `de` and `en`), `npm run wp:check` green; the repo-wide lint and
  test run also carry the in-flight work of other sessions (WP-M14-157 … 160),
  not of this package
- Follow-up WP: none — the comment of the office is closed
- Open question: none
