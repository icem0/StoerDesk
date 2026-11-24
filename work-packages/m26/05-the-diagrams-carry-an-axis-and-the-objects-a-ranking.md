# WP-M26-05: the diagrams carry an axis and the objects a ranking

format: ctx-256k
status: done
depends-on: WP-M26-04
phase: 26
milestone: m26
context-budget: 48k tokens
spec: specs/12-stats.md §12.3, §12.4; ADR-0049 (decision 3)
spec-lines: 50
changed-lines: 440

files-read:

- specs/12-stats.md §12.3, §12.4 (the series and the objects)
- apps/web/src/features/stats/charts.tsx (the diagram of the trends)
- apps/web/src/features/stats/stats-page.tsx (the page of the statistics)
- apps/web/src/lib/duration.ts (the formatting of a duration)
- apps/web/src/i18n/locales/de/stats.json (the texts of the statistics)

files-write:

- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/i18n/locales/de/stats.json, apps/web/src/i18n/locales/en/stats.json

interfaces:

- `BarChart` — the diagram of the count per bucket with an axis (inline SVG)
- `HorizontalBars` — the ranking of the objects (inline SVG)

## Task

The diagram of the count of the tickets was a row of bars without an axis,
without a scale and without a value, and the conspicuous objects were a table
without a picture of the ranking.

1. **The diagram** `apps/web/src/features/stats/charts.tsx` gains `BarChart`
   (y-axis with `0` and the maximum, x-axis with the date of the bucket, the
   value in the tooltip of the bar) and `HorizontalBars` (the ranking of the
   objects with the number at the end of the bar).
2. **The page** `apps/web/src/features/stats/stats-page.tsx` draws the count
   with the axis and adds the summary of the range (the total, the average per
   bucket, the maximum); the conspicuous objects get the ranking of the ten
   first objects above the table with the drilldown.
3. **The texts** in `de/stats.json` and `en/stats.json` name the axis, the
   summary and the ranking.
4. **The test** of the page proves the axis, the summary and the ranking.

## Non-goals

- No change of the answer of the API — the data is the answer of the
  frequency and of the objects.
- No new chart dependency and no aggregation in the browser: the summary is
  read from the series of the answer, the ranking from the list of the
  objects.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the page fails before the change and passes
after it.

## Handoff

- Files changed: the diagrams, the page and the two locales
- Interfaces added: `BarChart`, `HorizontalBars`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
