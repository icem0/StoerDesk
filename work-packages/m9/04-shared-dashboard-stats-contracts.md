# WP-M9-04: shared dashboard and statistics contracts

format: small-model
status: done
depends-on: WP-M9-01
phase: 9
milestone: m9
context-budget: 16k tokens
spec: specs/11-dashboard.md §11.2, §11.8; specs/12-stats.md §12.1–§12.5, §12.8
spec-lines: 160

files-read:

- specs/11-dashboard.md (§11.2 snapshot, §11.8 settings)
- specs/12-stats.md (§12.1 filters, §12.2–§12.5 answers, §12.8 API)
- packages/shared/src/schemas/index.ts (barrel)
- packages/shared/src/schemas/ticket.ts (enum and status style)
- packages/shared/src/schemas/oncall.ts (request/response style)
- packages/shared/src/__tests__/schemas.test.ts (shared schema test style)

files-write:

- packages/shared/src/schemas/dashboard.ts
- packages/shared/src/schemas/stats.ts
- packages/shared/src/schemas/index.ts
- packages/shared/src/__tests__/dashboardStats.test.ts

interfaces:

- `dashboardSnapshotSchema`, `DashboardSnapshot`
- `dashboardSettingsSchema`, `updateDashboardSettingsRequestSchema`
- `statsFilterSchema`, `StatsFilter`
- `reactionTimesResponseSchema`, `frequencyResponseSchema`, `topObjectsResponseSchema`, `complianceResponseSchema`, `declinesResponseSchema`
- `statsRangeInvalid` error code and the filter range rule (max. 366 days)

## Task

1. Add `packages/shared/src/schemas/dashboard.ts` with the snapshot of
    `specs/11-dashboard.md` §11.2 (fault-free counter, tiles with nullable
    on-call and channel sections, burning-now rows), the dashboard settings
    (`tvToken`, `tvAnonymize`, `conspicuousThreshold`) and their update request.
2. Add `packages/shared/src/schemas/stats.ts` with the filter schema
    (`from`, `to`, `objectNo`, `systemType`, `priority`, `technician`,
    `includeTest`, `includeSpam`, `bucket`) and the five response schemas of
    §12.2–§12.5. Enforce `from <= to`, calendar dates and the 366-day limit with
    a refinement.
3. Export both modules from `schemas/index.ts`; add no runtime code beyond Zod.
4. Add a shared schema test: valid and invalid filters, the 366-day boundary,
    a snapshot with `null` optional sections and the TV token shape.

## Non-goals

- No API route, service or database query.
- No CSV schema; the CSV writer formats the response objects of these schemas.
- No UI labels or locale files.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new schema test covers the range validation and the
nullable optional sections.

## Handoff

- Files changed: the two shared schema modules, the barrel, the schema test
- Interfaces added: the phase-9 request and response contracts above
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-05 (dashboard service), WP-M9-10 (statistics service)
- Open question: none
