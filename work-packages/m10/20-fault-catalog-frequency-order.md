# WP-M10-20: fault catalog ordered by recent usage in the report and office forms

format: small-model
status: done
depends-on: WP-M2-40, WP-M2-40b, WP-M9-03
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/06-report-form.md §7.9; specs/02-data-model.md §4.5; specs/12-stats.md §12.3; ADR-0015 (30-day window)
spec-lines: 40

files-read:

- apps/api/src/settings/text-templates.ts (the two catalog routes and `usageCount`)
- apps/api/src/db/migrations/0025_stats_views.sql (`stats_ticket_faults`)
- apps/api/src/settings/__tests__/textTemplates.integration.spec.ts (the catalog test)
- packages/shared/src/schemas/text-template.ts (the response contracts)
- apps/web/src/features/tickets/use-fault-catalog.ts (the forms consume the catalog in the answered order)

files-write:

- apps/api/src/settings/text-templates.ts
- apps/api/src/settings/__tests__/textTemplates.integration.spec.ts

interfaces:

- `recentFaultCounts(database, windowStart): Map<string, number>` — fault key → count over the last 30 days
- `byRecentUsage(counts)` — most frequent first, ties by key
- `GET /api/v1/public/text-templates` and `GET /api/v1/text-templates` — fault-template order by recent usage

## Task

1. Add `recentFaultCounts` — one aggregate over `stats_ticket_faults` (`0025`) grouping
   `fault_template_key` over the last `FAULT_CATALOG_WINDOW_DAYS` (30) days of
   non-test, non-spam tickets. It counts every ticket status so the running fault
   frequency matches what the reporter actually picks.
2. Add `byRecentUsage` — order by count descending, ties by key ascending, so the
   top-left checkbox is the fault the installation saw most often and the grid stays
   in reading order (`report-form-page.tsx` and `internal-create-page.tsx` render
   `entries.map` with a wrapping flex row, no re-ordering on the client).
3. Order both catalog routes with it: the unauthenticated public route (only consumer
   is the report form) and the authenticated admin list route (feeds the internal
   office create form). The array is ordered server-side; the contracts stay the same.
4. Extend the integration test: two templates with keys `a_rare` and `z_frequent` and
   three recent tickets (two for `z_frequent`) put `z_frequent` before `a_rare` in
   both the public and the admin answer — the opposite of the key order that existed
   before, so the test fails against the old implementation.

## Non-goals

- No change to the management screen: `text-templates-page.tsx` keeps an alphabetical
  list and re-sorts itself (WP-M10-20b).
- No change to the public response shape and no usage count exposed to the report form.
- No dashboard change (that is WP-M10-21).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. The new catalog test passes with a reachable `TEST_DATABASE_URL`
and skips with a named reason otherwise (reported as unverified, never as green).

## Handoff

- Files changed: the API catalog route and its integration test
- Interfaces added: `recentFaultCounts`, `byRecentUsage`, the frequency-ordered catalog answers
- Verified: typecheck, lint, test:run, wp:check (integration skipped without a database — reported unverified)
- Follow-up WP: WP-M10-20b (management screen stays alphabetical, file created in this commit)
- Open question: none
