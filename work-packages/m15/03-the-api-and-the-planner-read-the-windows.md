# WP-M15-03: the API reads and writes the duty windows

format: small-model
status: done
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
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/__tests__/routes.integration.spec.ts
- docs/REPO-MAP.md

interfaces:

- `readOncallSettings(database)` — resolves the duty windows
- `writeOncallSettings(database, patch)` — stores `oncall.weekly_windows`
- `generateShifts(database, input)` — creates one shift per duty window
- `PUT /api/v1/settings/oncall` — writes `oncall.weekly_windows`

## Task

1. `apps/api/src/oncall/settings.ts` knows the ninth key
   `oncall.weekly_windows`: the read resolves it over the settings rows, the
   write keeps it in the merged record and upserts it in the same transaction
   as the other keys.
2. `apps/api/src/oncall/service.ts` uses the windows: with at least one window
   the generation creates one shift per window per week
   (`generateOncallWindowSlots`), without a window it keeps the continuous plan
   (`generateOncallSlots`). The insert stays idempotent
   (`ON CONFLICT (pool_id, starts_at) DO NOTHING`).
3. The integration test writes the windows of the office through the API, reads
   them back, generates the shifts of a week and proves the two shifts with
   their times; a window with an end before the start and a second window on
   the same weekday are refused with `400 invalid_request`. The test restores
   the continuous plan at the end, because the settings are shared state.
4. `docs/REPO-MAP.md` names the settings module and the two generators.

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
  `apps/api/src/oncall/service.ts`, the integration test file,
  `docs/REPO-MAP.md`
- Interfaces added: the contracts above
- Verified: the commands above with a reachable Postgres
- Follow-up WP: WP-M15-04 (the administration form) — the file exists in the
  commit of the split
- Open question: none
