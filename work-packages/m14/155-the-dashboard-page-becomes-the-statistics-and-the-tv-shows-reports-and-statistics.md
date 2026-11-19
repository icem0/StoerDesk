# WP-M14-155: the dashboard page becomes the statistics and the TV shows reports and statistics

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/11-dashboard.md §11.7; specs/12-stats.md §12.2; PLAN.md §16
spec-lines: 120

depends-on: WP-M14-153

files-read:

- apps/web/src/routes/index.tsx, apps/web/src/components/Shell.tsx (the start page)
- apps/web/src/features/dashboard/{display,start-page,tv-page,use-dashboard,open-tickets}.tsx
- apps/api/src/dashboard/{service,tv-routes}.ts, packages/shared/src/schemas/dashboard.ts
- apps/web/src/features/stats/stats-page.tsx, apps/web/src/i18n/locales/{de,en}/{common,ticket,stats}.json

files-write:

- packages/shared/src/schemas/dashboard.ts, apps/api/src/dashboard/{service,tv-routes}.ts,
  apps/api/src/dashboard/**tests**/{dashboardService,tv.routes}.integration.spec.ts,
  packages/shared/src/**tests**/dashboardStats.test.ts
- apps/web/src/routes/index.tsx, apps/web/src/components/Shell.tsx,
  apps/web/src/components/**tests**/shell.test.tsx
- apps/web/src/features/dashboard/{display,tv-page,recent-tickets}.tsx,
  apps/web/src/features/dashboard/**tests**/tv-page.test.tsx,
  apps/web/src/features/stats/stats-page.tsx, apps/web/src/lib/duration.ts,
  apps/web/src/i18n/locales/{de,en}/{common,ticket,stats}.json
- docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `DashboardSnapshot.recentTickets` — the twelve latest reports by `reported_at`
- `resolveRecentTickets(database)` — the latest-report rows of the wall display
- `isHourValue(minutes)`, `formatHours(minutes, locale)` — durations from 60 minutes on

## Task

**The start page is the ticket list (out of band in phase 14).**

1. The dashboard page at `/` is gone. The root route redirects to `/tickets`; the
   header menu names the ticket list first, the statistics second and the readiness
   third. `start-page.tsx`, `use-dashboard.ts` and `open-tickets.tsx` are deleted.
2. The wall display shows two sides: the latest reports on the left, the statistics
   on the right. The snapshot contract and the service gain `recentTickets`, newest
   first, without test and suspected-spam tickets; the TV route pseudonymises its
   object names together with the burning-now rows.
3. The statistics never print a duration of 60 minutes or more in minutes. The new
   `lib/duration.ts` converts it to hours with at most one decimal; the statistics
   page and the evaluation block of the wall display use it.

## Non-goals

- No change of the statistics filters, the CSV export or the dashboard settings.
- No change of the SSE stream or the authenticated dashboard route.
- No change of the ticket list.

## Acceptance

```bash
npm run check
```

Expected: all green; the TV test proves the latest reports and the hour values.

## Handoff

- Files changed: contract, API service and TV route, route table and shell, the
  wall display with `recent-tickets.tsx`, the statistics page with `lib/duration.ts`,
  the locales, the tests and the repository docs
- Interfaces added: `DashboardSnapshot.recentTickets`, `resolveRecentTickets`,
  `isHourValue`, `formatHours`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check` and `npm run test:e2e`
- Follow-up WP: none
- Open question: none
