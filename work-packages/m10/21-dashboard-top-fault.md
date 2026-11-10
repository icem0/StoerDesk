# WP-M10-21: dashboard snapshot carries the most frequent fault of the last 30 days

format: small-model
status: done
depends-on: WP-M9-05, WP-M10-19, WP-M10-20, WP-M9-03
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/11-dashboard.md §11.2; specs/12-stats.md §12.3 (byFaultTemplate); ADR-0015 (30-day window)
spec-lines: 40

files-read:

- apps/api/src/dashboard/service.ts (the snapshot builder and `resolveDashboardEvaluations`)
- packages/shared/src/schemas/dashboard.ts (the snapshot contract)
- apps/api/src/stats/frequency.ts (the `byFaultTemplate` aggregate pattern over `stats_ticket_faults`)
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts (the service test)
- apps/api/src/db/migrations/0025_stats_views.sql (`stats_ticket_faults`)

files-write:

- packages/shared/src/schemas/dashboard.ts
- apps/api/src/dashboard/service.ts
- apps/api/src/dashboard/__tests__/dashboardService.integration.spec.ts

interfaces:

- `DashboardTopFault` and the optional, nullable `topFault` block of the snapshot
- `resolveTopFault(database, now): Promise<DashboardTopFault | null>`
- `GET /api/v1/dashboard` and the SSE stream carry `topFault`

## Task

1. Add the `topFault` block to `dashboardSnapshotSchema`: a nullable `key` plus a
   positive `count`. `optional()` so a browser holding an older SSE frame still
   parses. The block is language-neutral (only the machine key), so the API never
   answers translated text (PLAN.md §3).
2. Add `resolveTopFault` — one aggregate over `stats_ticket_faults` over the same
   30-day window and qualifying set as `resolveDashboardEvaluations` (non-test,
   non-spam, not cancelled): `COUNT(*)` per `fault_template_key`, ordered
   `COUNT DESC, key ASC`, `LIMIT 1`. A fault without a qualifying ticket yields
   `null`.
3. Add the block to `buildDashboardSnapshot`.
4. Extend the service test: three tickets carrying `feueralarm_ausloesung` and one
   carrying `strom` make the top fault `{ key, count: 3 }`; a window before any
   qualifying ticket answers `null`.

## Non-goals

- No start-page rendering and no locale keys (WP-M10-21b).
- No fault-catalog ordering change (that is WP-M10-20) and no statistics API change.
- No median, p90 or max anywhere; no new view and no SQL migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the extended service test passes with a reachable
`TEST_DATABASE_URL` and skips with a named reason otherwise (reported unverified, never green).

## Handoff

- Files changed: the shared snapshot schema, the service and its service test
- Interfaces added: `topFault` block, `resolveTopFault`
- Verified: typecheck, lint, test:run, wp:check (integration skipped without a database — reported unverified)
- Follow-up WP: WP-M10-21b (start-page block, file created in this commit)
- Open question: none
