# WP-M26-04: the statistics show the trends

format: ctx-256k
status: done
depends-on: WP-M26-03
phase: 26
milestone: m26
context-budget: 60k tokens
spec: specs/12-stats.md §12.11 (new); ADR-0049 (decision 3)
spec-lines: 90
changed-lines: 640

files-read:

- specs/12-stats.md §12.1, §12.3 (the filter and the series)
- apps/api/src/stats/filters.ts (`buildStatsFilter`, the range of the buckets)
- apps/api/src/stats/frequency.ts (the gap-free series)
- apps/api/src/stats/routes.ts (the routes of the statistics)
- packages/shared/src/schemas/stats.ts (the contracts of the answers)
- apps/web/src/features/stats/stats-page.tsx (the page of the statistics)

files-write:

- specs/12-stats.md
- packages/shared/src/schemas/stats.ts
- apps/api/src/stats/trends.ts
- apps/api/src/stats/routes.ts
- apps/api/src/stats/export.ts
- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/i18n/locales/de/stats.json, apps/web/src/i18n/locales/en/stats.json

interfaces:

- `GET /api/v1/stats/trends?bucket=day|week|month` — the averages per bucket
- `queryTrends(database, filter, now?): Promise<Trends>`
- `LineChart` — the diagram of a series over the buckets (inline SVG)

## Task

The page could not show a trend: the reaction times and the processing time
were a number over the whole range, and only the count of the tickets had a
series (ADR-0049 decision 3).

1. **The spec** `specs/12-stats.md` §12.11 (new) names the answer of the
   trends: one point per bucket with the number of the tickets, the average
   minutes of the review phase, of the acknowledge phase and of the processing
   time (`closed_at` minus `reported_at`); a bucket without a sample answers
   `null`; the buckets are gap-free like the series of the frequency.
2. **The contract** `packages/shared/src/schemas/stats.ts` gains
   `trendsResponseSchema`.
3. **The service** `apps/api/src/stats/trends.ts` calculates the averages per
   bucket in SQL over the same filter as the other sections; the route
   `apps/api/src/stats/routes.ts` answers `GET /api/v1/stats/trends` behind
   `stats.read`; the export `apps/api/src/stats/export.ts` writes the section
   `trends`.
4. **The diagram** `apps/web/src/features/stats/charts.tsx` draws the series
   as an inline SVG with an axis, a legend and a gap for a missing sample —
   no chart dependency (ADR-0012 decision 6).
5. **The page** `apps/web/src/features/stats/stats-page.tsx` shows two
   diagrams: the average reaction time of the two phases and the average
   processing time; the bucket of the diagrams is the bucket of the filter.
6. **The tests**: an integration test of the trends and a test of the diagram.

## Non-goals

- No median and no p90 in the trend — the diagram shows the average.
- No axis in the diagram of the count — **WP-M26-05**.
- No new chart dependency and no aggregation in the browser.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the spec, the contract, the service, the route, the export,
  the diagram, the page and the two locales
- Interfaces added: `GET /api/v1/stats/trends`, `queryTrends`, `LineChart`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
