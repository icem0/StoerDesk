# WP-M9-18: phase-9 exit criterion and record

format: small-model
status: planned
depends-on: WP-M9-02 … WP-M9-17
phase: 9
milestone: m9
context-budget: 20k tokens
spec: specs/11-dashboard.md §11.3; specs/12-stats.md §12.2; PLAN.md §16 phase 9, §20 items 8 and 9
spec-lines: 50

files-read:

- specs/11-dashboard.md (§11.3 fault-free counter and record)
- specs/12-stats.md (§12.2 reaction times, §12.7 views)
- apps/api/src/dashboard/service.ts (snapshot builder)
- apps/api/src/stats/reaction-times.ts (median query)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (database test setup)
- work-packages/README.md (backlog of record and record style)

files-write:

- apps/api/src/stats/__tests__/phase9-exit.integration.spec.ts
- apps/api/src/db/seed-stats-reference.ts
- work-packages/README.md, PLAN.md §16, docs/REPO-MAP.md, CHANGELOG.md (record)

interfaces:

- the phase-9 exit test: counter reset on a new report and ignored test ticket
- the reference data set whose reaction-time median matches a printed reference value
- the backlog and implementation-status record of phase 9

## Task

1. Add `apps/api/src/db/seed-stats-reference.ts`: an idempotent, test-only
   reference data set with explicit `tickets.is_test = false` reference tickets
   and at least one `is_test = true` ticket, derived from the acceptance data of
   `PLAN.md` §20 items 8 and 9.
2. Add `apps/api/src/stats/__tests__/phase9-exit.integration.spec.ts`: create
   the reference set, assert the fault-free counter resets on a new qualifying
   report, assert the `is_test` ticket and a cancelled ticket do not reset it,
   and assert the reaction-time median equals the printed reference value.
3. Assert the statistics views and the dashboard snapshot agree on the open and
   overdue counts for the same reference data.
4. Mark WP-M9-01 … WP-M9-18 `done` in `work-packages/README.md`, add the
   phase-9 record to `PLAN.md` §16, update the implementation status of
   `docs/REPO-MAP.md` and add the entry to `CHANGELOG.md`.
5. Report the exit criterion result in the handoff; do not weaken any skipped
   gate.

## Non-goals

- No new product behaviour.
- No phase-10 API, import or privacy work.
- No Docker gate: this phase has no compose change.
- No screenshot or visual-regression gate.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the exit test runs against PostgreSQL or skips with a named
reason. The median is asserted against a printed value, not inferred.

## Handoff

- Files changed: the reference seed, the phase-9 exit test plus the backlog,
  plan, repo-map and changelog record
- Interfaces added: none (verification and record only)
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: none; phase 9 closes with this package
- Open question: none
