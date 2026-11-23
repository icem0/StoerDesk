# WP-M20-07: the iCal feed reads the pattern

format: small-model
status: planned
depends-on: WP-M20-06
phase: 20
milestone: m20
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.7
spec-lines: 40

files-read:

- apps/api/src/oncall/ical.ts (the personal feed)
- apps/api/src/oncall/routes.ts (the feed route)
- apps/api/src/oncall/**tests**/ical.integration.spec.ts

files-write:

- apps/api/src/oncall/ical.ts
- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/**tests**/ical.integration.spec.ts

interfaces:

- the iCal feed emits one `RRULE` (`FREQ=WEEKLY;BYDAY=…`) per block with the
  daily window; a shift without a pattern keeps its plain entry

## Task

1. The feed route reads the pattern of the shift.
2. The feed emits one recurring entry per block: `DTSTART` with the zone of
   `Europe/Berlin`, the daily window as `DTEND` and the `RRULE` of the covered
   weekdays.
3. Test: the feed holds one entry per block with its `RRULE`.

## Non-goals

- No form, no migration, no change of the coupling (WP-M20-06).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change.

## Handoff

- Files changed: `ical.ts`, `routes.ts`, the iCal test
- Interfaces added: the rules above
- Verified: the commands above
- Follow-up WP: WP-M20-08
- Open question: none
