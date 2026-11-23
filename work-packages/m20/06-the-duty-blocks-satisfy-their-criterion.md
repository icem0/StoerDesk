# WP-M20-06: the duty blocks satisfy their criterion

format: small-model
status: planned
depends-on: WP-M20-05
phase: 20
milestone: m20
context-budget: 14k tokens
spec: specs/04-oncall.md §4a.3.3, §4a.6; PLAN.md §16 phase 20
spec-lines: 30

files-read:

- apps/api/src/oncall/**tests**/window-plan.integration.spec.ts
- specs/04-oncall.md (§4a.3.3)

files-write:

- apps/api/src/oncall/**tests**/duty-blocks.integration.spec.ts
- specs/04-oncall.md (§4a.9 boundary)
- PLAN.md (§16 phase 20 status)

interfaces:

- the phase-20 exit criterion: the office week holds two shifts, the technician
  week holds one shift, and the coupling names the technician only inside the
  pattern

## Task

1. Integration test: „Verwaltung“ (Mo–Do 07:00–17:00, Fr 07:00–12:00) generates
   exactly two shifts per week; „Technik“ (Mo–So 00:00–24:00) generates one.
2. The test assigns the Monday block and proves: Monday 08:00 covered, Friday
   15:00 not covered, Saturday not covered for the office.
3. `specs/04-oncall.md` §4a.9 names the boundary of the existing day shifts.

## Non-goals

- No change of the acceptance script `scripts/e2e-acceptance.mjs`.

## Acceptance

```bash
npm run check
```

Expected: `npm run check` green with a reachable Postgres; Docker is not part of
this gate.

## Handoff

- Files changed: the integration test, §4a.9, `PLAN.md` §16
- Interfaces added: the exit criterion above
- Verified: the commands above
- Follow-up WP: none — phase 20 is closed
- Open question: none
