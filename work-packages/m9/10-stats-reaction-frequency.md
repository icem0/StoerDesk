# WP-M9-10: statistics reaction-time and frequency services

format: small-model
status: planned
depends-on: WP-M9-03, WP-M9-04
phase: 9
milestone: m9
context-budget: 20k tokens
spec: specs/12-stats.md §12.1–§12.3; ADR-0012 decision 8
spec-lines: 110

files-read:

- specs/12-stats.md (§12.1 filters, §12.2 reaction times, §12.3 frequency)
- packages/shared/src/schemas/stats.ts (filter and response contracts)
- apps/api/src/db/migrations/0024_stats_views.sql (view columns)
- apps/api/src/tickets/list.ts (SQL and Drizzle query patterns)
- apps/api/src/db/client.ts (`Database` type)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (database test setup)

files-write:

- apps/api/src/stats/filters.ts
- apps/api/src/stats/reaction-times.ts
- apps/api/src/stats/frequency.ts
- apps/api/src/stats/__tests__/reactionFrequency.integration.spec.ts

interfaces:

- `buildStatsFilter(filter, now)` — shared range and dimension predicate over `stats_tickets`
- `queryReactionTimes(database, filter)` — §12.2 with `count`, median, average, p90 and pause totals
- `queryFrequency(database, filter)` — §12.3 series and the three groupings

## Task

1. Add `apps/api/src/stats/filters.ts`: convert the shared filter to a SQL
   predicate over `stats_tickets`. The local `from`/`to` dates become UTC
   instants with `date-fns-tz`; `objectNo` is case-insensitive, `systemType`
   exact, `priority` exact, `technician` a user id. Test and spam tickets are
   excluded unless the corresponding flag is set.
2. Implement `queryReactionTimes` in `apps/api/src/stats/reaction-times.ts`:
   one aggregate per phase with `count`, `percentile_cont(0.5)` (median),
   `avg` and `percentile_cont(0.9)`, rounded to whole minutes; add the summed
   pause minutes and the count of paused tickets from `stats_tickets`.
3. Implement `queryFrequency` in `apps/api/src/stats/frequency.ts`: the local
   bucket series (`day`/`week`/`month`, Monday weeks, zero-filled) and the
   `bySystemType`, `byFaultTemplate` and `bySource` groupings.
4. Add an integration test with fixed reference tickets: the median and p90 of
   a known set, the pause total, a zero-filled empty bucket, and the exclusion
   of a test ticket and a suspected-spam ticket by default.

## Non-goals

- No route, CSV or UI.
- No top-object, compliance or decline query (WP-M9-11).
- No materialized view or cached result.
- No client-side aggregation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the reference median of `PLAN.md` §20 item 9 is asserted,
and the test skips with a named reason without `TEST_DATABASE_URL`.

## Handoff

- Files changed: the shared filter builder, the two statistics services and their test
- Interfaces added: `buildStatsFilter`, `queryReactionTimes`, `queryFrequency`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-11 (objects/compliance/declines), WP-M9-12 (routes)
- Open question: none
