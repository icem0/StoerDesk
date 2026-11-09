# WP-M9-15: web statistics page, filters and charts

format: small-model
status: planned
depends-on: WP-M9-12, WP-M9-13, WP-M9-04
phase: 9
milestone: m9
context-budget: 24k tokens
spec: specs/12-stats.md §12.1–§12.5, §12.8, §12.9
spec-lines: 150

files-read:

- specs/12-stats.md (§12.1 filters, §12.2–§12.5 answers, §12.9 CSV)
- apps/web/src/features/tickets/ticket-list-page.tsx (filter and query-param pattern)
- apps/web/src/routes/index.tsx (route registration)
- apps/web/src/components/Shell.tsx (navigation groups)
- apps/web/src/i18n/locales/de/stats.json (empty namespace)
- packages/shared/src/schemas/stats.ts (filter and response contracts)

files-write:

- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/{de,en}/stats.json and common.json

interfaces:

- `StatsPage` at `/stats`, guarded by `RequireSession` and `stats.read`
- range/quick-filter controls, object/type/priority/technician filters
- reaction-time cards, frequency SVG chart and tables, top objects with drilldown, compliance and decline cards
- CSV download button guarded by `stats.export`

## Task

1. Build `stats-page.tsx` against the four JSON routes and the CSV route:
   a range picker (week, month, quarter, year, custom) and the dimension
   filters, with the filter state in the URL query like the ticket list.
2. Render the reaction-time figures (count, median, average, p90, pause totals),
   the frequency series as inline SVG bars/lines with zero-filled buckets, and
   the three groupings as accessible tables.
3. Render top objects with the conspicuous marker and a drilldown link to the
   ticket list, plus the compliance and decline cards of §12.5.
4. Add the CSV button only for `stats.export`; download through the API route
   with `content-disposition` and keep the current filter.
5. Register `/stats`, add the navigation entry in the tests/operations group,
   and fill the `de`/`en` `stats` namespace and the `stats` nav label.

## Non-goals

- No chart dependency; the series is SVG and CSS.
- No PDF, scheduled report or e-mail.
- No TV page (WP-M9-16) and no dashboard settings (WP-M9-17).
- No client-side aggregation of ticket rows.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the page renders the four sections for a `manager`, hides
the CSV button without `stats.export`, and `stats` namespace keys are complete
in both locales.

## Handoff

- Files changed: the statistics page, the route table, the shell navigation, both
  stats and common locale files
- Interfaces added: `/stats`, the filters and the CSV download button
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: WP-M9-16 (TV page)
- Open question: none
