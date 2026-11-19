# WP-M15-02: the shared contracts and the window generator

format: small-model
status: done
depends-on: WP-M15-01
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.1, §4a.3.2
spec-lines: 60

files-read:

- packages/shared/src/oncall.ts (the resolver, the defaults, the slot generator)
- packages/shared/src/schemas/oncall.ts (the settings contracts)
- packages/shared/src/__tests__/oncall.test.ts (the tests of the resolver and the generator)
- apps/api/src/oncall/routes.ts (the answer of the settings)
- specs/04-oncall.md (§4a.1, §4a.3.2)

files-write:

- packages/shared/src/oncall.ts
- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/routes.ts
- packages/shared/src/__tests__/oncall.test.ts

interfaces:

- `oncallWindowSchema` — `{ weekday, start, end }`, the end later than the start
- `oncallSettingsResponseSchema` — carries `weeklyWindows`
- `updateOncallSettingsRequestSchema` — carries `oncall.weekly_windows`
- `resolveOncallSettings(values)` — resolves `weeklyWindows`, invalid values fall back
- `generateOncallWindowSlots({ from, to, weeklyWindows }): OncallSlot[]`

## Task

1. `packages/shared/src/schemas/oncall.ts` gains `oncallWindowSchema`: the
   weekday `0`–`6`, the start and the end as `HH:MM`, the end later than the
   start on the same day. The settings response carries `weeklyWindows`, the
   request carries `oncall.weekly_windows` (an array of at most seven windows,
   at most one per weekday).
2. `packages/shared/src/oncall.ts` gains the type `OncallWindow` and the
   default `weeklyWindows: []`. `resolveOncallSettings` reads the windows: a
   value that is not an array falls back to the default, a malformed entry is
   dropped, the rest is sorted by the weekday.
3. The same file gains `generateOncallWindowSlots({ from, to, weeklyWindows })`:
   one slot per window per week, the start and the end as the local wall clock
   of `Europe/Berlin`, both ends converted to UTC with `date-fns-tz`. A window
   that contains a DST change is one hour shorter or longer.
4. `apps/api/src/oncall/routes.ts` answers `weeklyWindows` in both settings
   routes, so the answer stays valid once the contract knows the field. The
   write path follows with WP-M15-03.
5. The unit test file covers the resolver (the default, the valid value, the
   malformed entries, the duplicate weekday) and the generator (the windows of
   the office, a free weekday, the week over the range border, the DST window).

## Non-goals

- No change of `generateOncallSlots`: the continuous plan of ADR-0011 keeps its
  function and its DST tests.
- No API, no route, no form.
- No second window per weekday and no night window (§4a.3.2).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `packages/shared/src/oncall.ts`,
  `packages/shared/src/schemas/oncall.ts`, the shared test file
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M15-03 (the write path and the planner) — the file exists in
  the commit of the split
- Open question: none
