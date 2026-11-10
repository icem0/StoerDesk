# WP-M10-19: dashboard evaluations — average reaction and processing times

format: small-model
status: done
depends-on: WP-M9-05, WP-M9-04
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/11-dashboard.md §11.2, §11.4a; specs/12-stats.md §12.10; ADR-0015
spec-lines: 60

files-read:

- apps/api/src/dashboard/service.ts (the snapshot builder)
- apps/api/src/stats/reaction-times.ts (the duration-aggregate SQL pattern)
- packages/shared/src/schemas/dashboard.ts (the snapshot contract)
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts (the service test)
- specs/11-dashboard.md (§11.2 snapshot, §11.4 tiles)
- docs/DECISIONS/0015-dashboard-evaluation-averages.md (the decision)

files-write:

- packages/shared/src/schemas/dashboard.ts
- apps/api/src/dashboard/service.ts
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts

interfaces:

- `resolveDashboardEvaluations(database, now)` — window count plus four nullable averages
- `dashboardEvaluationsSchema`, `DashboardEvaluations` and the snapshot's `evaluations` block

## Task

1. Extend `dashboardSnapshotSchema` with the `evaluations` block of §11.4a
   (ADR-0015): `windowDays`, `tickets` and the nullable whole-minute averages
   `averageReviewMinutes`, `averageFirstResponseMinutes`,
   `averageAcknowledgeMinutes` and `averageProcessingMinutes`. The block is
   `optional()` so a browser holding an older SSE frame still parses.
2. In `service.ts` add `resolveDashboardEvaluations`: one aggregate over
   `stats_tickets` for the last 30 days (`EVALUATION_WINDOW_DAYS`) of the
   counter's qualifying set (`is_test = false`, `suspected_spam = false`,
   `status <> 'CANCELLED'`, `reported_at` in the window). Phases are measured
   from `reported_at` like §12.2; `averageProcessingMinutes` is
   `closed_at - reported_at`.
3. Averages only: no median, no p90, no `MAX` anywhere — the worst reaction
   time must not be calculated and not displayed (ADR-0015 decision 2).
   A null end column or a negative duration leaves the average; no sample
   means `null`.
4. Add the block to `buildDashboardSnapshot` and extend the integration test:
   a closed reference ticket makes the four averages computable by hand, the
   test ticket and the cancelled one stay out of the count, and a window
   without tickets answers `tickets: 0` with all averages `null`.

## Non-goals

- No start-page rendering and no locale keys (WP-M10-19b).
- No statistics API or statistics-page change; p90 stays there only.
- No new setting, no new view and no SQL migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test passes or skips with a named reason
when no `TEST_DATABASE_URL` is reachable.

## Handoff

- Files changed: the shared schema, the service and its integration test
- Interfaces added: the evaluations block and `resolveDashboardEvaluations`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M10-19b (start-page block, file created in this commit)
- Open question: none
