# WP-M20-06: the coupling reads the pattern

format: small-model
status: done
depends-on: WP-M20-05
phase: 20
milestone: m20
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.6
spec-lines: 40

files-read:

- apps/api/src/oncall/coupling.ts (`resolveOnCallPerson`)
- apps/api/src/oncall/**tests**/coupling.integration.spec.ts
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/oncall/**tests**/coupling.integration.spec.ts

interfaces:

- `resolveOnCallPerson` covers a time only inside the pattern of its shift

## Task

1. The coupling reads the pattern of the shift and uses `isCoveredByPattern` of
   WP-M20-02: a time on a free weekday or outside the daily window of the
   block names nobody.
2. A shift without a pattern keeps covering its whole span.
3. Tests: a time inside the span on a covered weekday is covered; a time on a
   free weekday or outside the daily window is not.

## Non-goals

- No change of the iCal feed (WP-M20-07).
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

- Files changed: `coupling.ts`, the coupling test
- Interfaces added: the rules above
- Verified: the commands above
- Follow-up WP: WP-M20-07
- Open question: none
