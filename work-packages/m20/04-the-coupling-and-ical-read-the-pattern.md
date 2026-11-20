# WP-M20-04: the coupling and the iCal feed read the pattern

format: small-model
status: planned
depends-on: WP-M20-03
phase: 20
milestone: m20
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.6, §4a.7
spec-lines: 40

files-read:

- apps/api/src/oncall/coupling.ts (`resolveOnCallPerson`)
- apps/api/src/oncall/ical.ts (the personal feed)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/oncall/ical.ts
- apps/api/src/oncall/__tests__/ical.integration.spec.ts

interfaces:

- `resolveOnCallPerson` covers a time only inside the pattern of its shift
- the iCal feed emits one `RRULE` (`FREQ=WEEKLY;BYDAY=…`) per block

## Task

1. Coupling uses `isCoveredByPattern` of WP-M20-02 for a shift with a pattern.
2. iCal emits one recurring entry per block with the daily window.
3. Tests: a time inside the span on a covered weekday is covered; a time on a
   free weekday or outside the daily window is not; the feed holds one entry per
   block.

## Non-goals

- No form, no migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change.

## Handoff

- Files changed: `coupling.ts`, `ical.ts`, the iCal test
- Interfaces added: the rules above
- Verified: the commands above
- Follow-up WP: WP-M20-05
- Open question: none
