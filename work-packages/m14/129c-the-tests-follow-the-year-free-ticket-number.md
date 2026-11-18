# WP-M14-129c: the tests follow the year-free ticket number

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/02-data-model.md §4.11 (ADR-0027), specs/06-report-form.md §7.3.2; PLAN.md §18
spec-lines: 30

depends-on: WP-M14-129b, WP-M2-04, WP-M2-10

files-read:

- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (the shape assertion)
- apps/web/e2e/report-form.spec.ts (the confirmation assertion)
- apps/web/e2e/report-flow.spec.ts (the phase-2 exit criterion)
- apps/api/src/db/migrations/0048_ticket_no_counter_global.sql
- specs/06-report-form.md (§7.3.2)

files-write:

- apps/api/src/db/__tests__/ticketTables.integration.spec.ts
- apps/web/e2e/report-form.spec.ts
- apps/web/e2e/report-flow.spec.ts
- docs/REPO-MAP.md (the row of the two E2E files)

interfaces:

- the migrated `tickets` tables answer a `ticket_no` of `^ST-\d{4,}$`
- a legacy `ticket_no` of `^ST-\d{4}-\d{4,}$` still resolves on the detail route

## Task

1. `apps/api/src/db/__tests__/ticketTables.integration.spec.ts`: the assertion of
   the allocated number moves from `^ST-${year}-\d{4}$` to `^ST-\d{4,}$` (the
   padded global counter without a year), and the insertion still allocates
   through the column default `next_ticket_no()`. The suite already inserts
   several tickets: assert that two reports in one run get two **different**
   numbers and that the number of a fixture written before ADR-0027
   (`ST-2026-0001`) is still accepted by `ticketNoSchema` and resolves to its
   row — no product route may reject a number the database still holds.
2. `apps/web/e2e/report-form.spec.ts` and `apps/web/e2e/report-flow.spec.ts`:
   the confirmation and the status-page assertion move from
   `/ST-\d{4}-\d{4,}/` to `/ST-\d{4,}/`.
3. `docs/REPO-MAP.md`: the row of the two E2E files drops `ST-<year>-NNNN` and
   names `ST-NNNN` with the WP id.

## Non-goals

- No change of the migration suites of `apps/api/src/db/__tests__/migrations.spec.ts`
  (they read migration `0004`, whose yearly function is still its history).
- No change of the fixtures that hand out literal `ST-2026-…` numbers: the
  contract of WP-M14-129b keeps them valid on purpose.
- No new product file, no schema, no route, no UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run test:e2e
npm run wp:check
```

Expected: green. A `test:run` or `test:e2e` job that skipped because no
PostgreSQL or no browser is reachable is reported **unverified**
(`PLAN.md` §18), never as green.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — the year-free number is closed with WP-M14-129a … c
- Open question: none
