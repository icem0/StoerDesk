# WP-M15-01: the duty windows — the spec, ADR-0035 and the split

format: small-model
status: done
depends-on: —
phase: 15
milestone: m15
context-budget: 14k tokens
spec: PLAN.md §8, §16 phase 15, §19; specs/04-oncall.md §4a.1, §4a.3.1, §4a.6
spec-lines: 120

files-read:

- PLAN.md (§8 on-call calendar, §16 phase roadmap, §17 work-package limits)
- specs/04-oncall.md (§4a.1 settings, §4a.3.1 slot calculation, §4a.6 coupling)
- apps/api/src/oncall/settings.ts (the eight keys of the settings)
- packages/shared/src/oncall.ts (the resolver and the slot generator)
- docs/DECISIONS/0011-oncall-slot-model-and-swap-approval.md (the continuous plan)
- apps/web/src/admin/oncall-page.tsx (the form of the eight keys)

files-write:

- specs/04-oncall.md (§4a.1, §4a.3.2)
- docs/DECISIONS/0035-the-readiness-knows-a-duty-window-per-weekday.md and
  docs/DECISIONS.md (the index)
- PLAN.md (§8, §16)
- work-packages/m15/ (WP-M15-02 … WP-M15-05, each file created in this commit),
  work-packages/README.md and CHANGELOG.md

interfaces:

- `oncall.weekly_windows` — the duty windows of the plan (ADR-0035)
- `generateOncallWindowSlots({ from, to, weeklyWindows })` — one slot per window per week
- `specs/04-oncall.md` §4a.3.2 — the window plan beside the continuous plan

## Task

**The comment of the office.** „bei die folgenden einstellungen brauchen wir
einen endzeitpunkt … es lässt sich beispielsweise nicht die schicht der
verwaltung abbilden die von montag von 7:30-17:00 uhr und am freitag von
7:00-12:00 uhr da sind."

The plan of the readiness knows a week start, a start time and a duration in
days, so a shift is a block that never ends and the plan has no end of a duty
at all. This package is the **spec and the split** — no product code:

1. `specs/04-oncall.md` §4a.1 gains the setting `oncall.weekly_windows` and the
   two shapes of the plan; the new §4a.3.2 names the window, its rules, the
   generator and the example of the office.
2. `docs/DECISIONS/0035-the-readiness-knows-a-duty-window-per-weekday.md`
   decides the model (ADR-0035) and the index of `docs/DECISIONS.md` gains the
   row.
3. `PLAN.md` §8 names the duty windows next to the defaults, §16 gains the
   phase-15 row and the record of the chain.
4. Create the work packages WP-M15-02 … WP-M15-05 in `work-packages/m15/` in
   numeric order (contracts and generator → API and planner → form →
   exit criterion).
5. Record the split in `work-packages/README.md` and `CHANGELOG.md`.

## Non-goals

- No schema, service, route, UI or test code in this package.
- No migration: the windows are a jsonb value of the `settings` table (§4a.1).
- No change of the shifts that exist: the windows create new shifts (§4a.3.2).
- No night window (an end before the start) and no second window per weekday.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with the five new WP files valid; `check` green
because this package changes documentation only. No Docker gate is part of
this WP.

## Handoff

- Files changed: `specs/04-oncall.md`, ADR-0035, the decision index,
  `PLAN.md` §8 and §16, the m15 WP files, `work-packages/README.md` and
  `CHANGELOG.md`
- Interfaces added: the contracts above — the setting, the generator and the
  section of the spec
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M15-02, WP-M15-03, WP-M15-04, WP-M15-05 (each file exists in
  this commit)
- Open question: none
