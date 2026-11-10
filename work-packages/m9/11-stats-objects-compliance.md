# WP-M9-11: statistics objects, compliance and decline services

format: small-model
status: done
depends-on: WP-M9-10
phase: 9
milestone: m9
context-budget: 18k tokens
spec: specs/12-stats.md §12.4–§12.5; ADR-0012 decision 7
spec-lines: 90

files-read:

- specs/12-stats.md (§12.4 top objects, §12.5 compliance and declines)
- apps/api/src/stats/filters.ts (shared predicate)
- packages/shared/src/schemas/stats.ts (response contracts)
- apps/api/src/db/migrations/0024_stats_views.sql (view columns)
- apps/api/src/db/schema.ts (`ticketEvents` for decline reasons)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (database test setup)

files-write:

- apps/api/src/stats/objects.ts
- apps/api/src/stats/compliance.ts
- apps/api/src/stats/__tests__/objectsCompliance.integration.spec.ts

interfaces:

- `queryTopObjects(database, filter, settings)` — top 25 with `conspicuous` from the 90-day threshold
- `queryCompliance(database, filter, now)` — acknowledged, on-time, late, open overdue, rate
- `queryDeclines(database, filter)` — decline rate and top ten normalized reasons

## Task

1. Implement `queryTopObjects` in `apps/api/src/stats/objects.ts`: group the
   filtered set by object, sort by count descending then lower-case object
   number, limit 25. The `conspicuous` flag runs a second aggregate over the 90
   days before `to`, independent of the selected range, against
   `stats.conspicuous_threshold`.
2. Implement `queryCompliance` in `apps/api/src/stats/compliance.ts`: the
   acknowledged sets of §12.5, `acknowledged_at <= deadline_at` as on time,
   `openOverdue` for open non-cancelled tickets with a passed deadline, and a
   `null` rate when nothing was acknowledged.
3. Implement `queryDeclines` in the same file: denominator of distinct tickets
   that reached `OFFERED` or `ASSIGNED`, numerator of distinct tickets with a
   `declined` event, and the top ten trimmed lower-case reasons from the event
   payload.
4. Add an integration test with reference tickets: the conspicuous flag turns on
   above the threshold and ignores the selected range, an acknowledged ticket
   before and after its deadline is counted correctly, and the decline rate and
   reason grouping match the inserted events.

## Non-goals

- No route, CSV or UI.
- No object-type deadline analysis.
- No stored conspicuous flag and no nightly scan.
- No sorting or normalization in the client.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the reference assertions pass or skip with a named reason
without `TEST_DATABASE_URL`.

## Handoff

- Files changed: the two statistics services and their integration test
- Interfaces added: `queryTopObjects`, `queryCompliance`, `queryDeclines`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-12 (statistics routes)
- Open question: none
