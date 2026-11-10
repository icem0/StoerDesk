# WP-M9-10: statistics reaction-time and frequency services

format: small-model
status: done
depends-on: WP-M9-03, WP-M9-04
phase: 9
milestone: m9
context-budget: 20k tokens
spec: specs/12-stats.md §12.1–§12.3; ADR-0012 decision 8
spec-lines: 110

files-read:

- specs/12-stats.md (§12.1 filters, §12.2 reaction times, §12.3 frequency)
- packages/shared/src/schemas/stats.ts (filter and response contracts)
- apps/api/src/db/migrations/0025_stats_views.sql (view columns)
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
- Verified: typecheck, lint, test:run (832 tests), wp:check, i18n:check
- Follow-up WP: WP-M9-11 (objects/compliance/declines), WP-M9-12 (routes)
- Open question: none

## Record

The statistics views live in migration `0025_stats_views` (WP-M9-03 numbered
it `0024` before WP-M9-27 took `0024_ticket_purges_append_only`), so the
services read `stats_tickets` and `stats_ticket_faults` from there.

`buildStatsFilter` returns the `WHERE` fragment and the resolved range: the
local days `from` … `to` become UTC instants with `date-fns-tz`, so a DST day
keeps its real length (23 hours on 2026-03-29). The predicate is built with
Drizzle's `sql.join`, so the parameter numbers stay stable while the same
fragment is reused by four queries. The instants travel as ISO strings with an
explicit `::timestamptz` cast — the driver cannot serialize a raw `Date`
through the raw SQL template.

`queryReactionTimes` runs one aggregate per phase over `stats_tickets`: the
median is `percentile_cont(0.5)`, the p90 `percentile_cont(0.9)`, both rounded
to whole minutes; a negative duration is ignored. The pauses are reported next
to the phases and never subtracted from them (ADR-0012 decision 8).

`queryFrequency` buckets on the Berlin local date of `reported_at`
(`date_trunc` over `AT TIME ZONE 'Europe/Berlin'`), so a ticket lands in the
same local bucket whatever the server time zone is; a week starts on Monday.
The series comes from `generate_series` left-joined to the counted buckets, so
an empty bucket is answered with `total: 0` and the axis has no gaps.

The integration test runs against a throwaway database and asserts the
medians, averages and p90 values of a known set of tickets, the pause total, a
zero-filled empty bucket and the default exclusion of a test ticket and a
suspected-spam ticket. It skips with a named reason without
`TEST_DATABASE_URL`.
