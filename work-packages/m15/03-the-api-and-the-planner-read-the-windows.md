# WP-M15-03: the API and the planner read the windows

format: small-model
status: planned
depends-on: WP-M15-02
phase: 15
milestone: m15
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.1, §4a.3.2, §4a.8
spec-lines: 60

files-read:

- apps/api/src/oncall/settings.ts (the read and the write of the eight keys)
- apps/api/src/oncall/routes.ts (the settings routes)
- apps/api/src/oncall/service.ts (the generation of the shifts)
- apps/api/src/oncall/__tests__/routes.integration.spec.ts (the tests of the settings)
- packages/shared/src/oncall.ts (the generator of the windows)
- specs/04-oncall.md (§4a.1, §4a.3.2)

files-write:

- apps/api/src/oncall/settings.ts
- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/__tests__/routes.integration.spec.ts

interfaces:

- `GET /api/v1/settings/oncall` — answers `weeklyWindows`
- `PUT /api/v1/settings/oncall` — writes `oncall.weekly_windows`
- `readOncallSettings(database)` — resolves the windows
- `writeOncallSettings(database, patch)` — stores the windows
- `generateShifts(database, input)` — creates one shift per window

## Task

1. `apps/api/src/oncall/settings.ts` knows the ninth key
   `oncall.weekly_windows`: the read resolves it over the settings rows, the
   write stores it in the same transaction as the other keys and keeps it in
   the merged record of the write.
2. `apps/api/src/oncall/routes.ts` answers `weeklyWindows` in the settings
   response and accepts `oncall.weekly_windows` in the request. A malformed
   window — a weekday outside `0`–`6`, a time that is no `HH:MM`, an end
   before the start, a second window on a weekday — answers
   `400 invalid_request` with the field path.
3. `apps/api/src/oncall/service.ts` uses the windows: with at least one window
   the generation creates one shift per window per week
   (`generateOncallWindowSlots`), without a window it keeps the continuous plan
   (`generateOncallSlots`). The insert stays idempotent
   (`ON CONFLICT (pool_id, starts_at) DO NOTHING`).
4. The integration test writes the windows of the office through the API, reads
   them back, generates the shifts of a week and proves the five shifts with
   their times; a malformed window is refused.

## Non-goals

- No form: the administration comes with WP-M15-04.
- No change of the coupling, the warnings, the iCal feed or the swaps: they
  work on a shift (§4a.3.2).
- No deletion of the shifts of the continuous plan.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `apps/api/src/oncall/settings.ts`,
  `apps/api/src/oncall/routes.ts`, `apps/api/src/oncall/service.ts`, the
  integration test file
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M15-04 (the administration form) — the file exists in the
  commit of the split
- Open question: none
