# WP-M2-67: the migration snapshot chain is complete again

format: small-model
status: planned
depends-on: WP-M2-19a, WP-M2-34
phase: 2
context-budget: 14k tokens
spec: specs/02-data-model.md §4.8, PLAN.md §6 (tickets workflow columns), PLAN.md §18.2 (drizzle-kit output folder)
spec-lines: 40

files-read:

- apps/api/src/db/migrations/0006_ticket_workflow_columns.sql — the hand-written migration (WP-M2-19a)
- apps/api/src/db/schema.ts — the `tickets` table (WP-M2-04)
- apps/api/src/db/migrations/meta/_journal.json — 11 entries, one of them without a snapshot
- apps/api/src/db/migrations/meta/0005_snapshot.json — the snapshot before the gap
- apps/api/src/db/__tests__/migrations.spec.ts — the existing migration guard tests
- apps/api/drizzle.config.ts — `out: './src/db/migrations'`

files-write:

- apps/api/src/db/schema.ts — the workflow columns and the index of migration 0006 on `tickets`
- apps/api/src/db/migrations/meta/ — generated chain metadata only, not source (`PLAN.md` §17):
  the new `0006_snapshot.json` and the same workflow entries merged into `0007` … `0010`
- apps/api/src/db/__tests__/migrations.spec.ts — the chain guard test

interfaces:

- `tickets` in the Drizzle schema gains `assignedUserId`, `reviewedByUserId`,
  `reviewStartedAt`, `offeredToUserId`, `offerEscalatedAt`, `workOrderType`,
  `workOrderNumber`, `acceptedAt`, `firstResponseAt`, `acknowledgedAt`, `closedAt`
  and the index `tickets_assigned_user_id_status_idx` — the columns migration 0006 created
- `meta/0006_snapshot.json` closes the chain: `prevId` is the id of `0005`, and the `prevId`
  of `0007` is the id of `0006`; the last snapshot of the chain equals the current schema
- migration guard test: every journal entry has a snapshot file, the `id`/`prevId` chain
  links, and the last snapshot's `tickets` columns equal `getTableColumns(tickets)`

## Task

1. `apps/api/src/db/schema.ts`: add the eleven nullable `tickets` columns and
   `tickets_assigned_user_id_status_idx` exactly as migration `0006` created them — the
   three actor columns as `uuid` references to `users` with `ON DELETE SET NULL`, the six
   timestamps as `timestamp with time zone` (`timestampOptions`), `work_order_type` and
   `work_order_number` as `text`. **No new `.sql` file**: the columns are already in every
   database, so a second `ALTER TABLE` would fail on a deployed host.
2. Close the chain: generate once against the updated schema to obtain the target
   snapshot, then write `meta/0006_snapshot.json` as `0005_snapshot.json` plus the objects
   of migration 0006, merge those same objects into `0007` … `0010_snapshot.json`, relink
   `0007.prevId` to the id of `0006` and delete the temporary generated
   `0011_*` artifacts and its journal entry. The merged `0010` must be equal to the
   generated target snapshot apart from `id`/`prevId`.
3. Verify the repair: `npm run db:generate -w @stoerdesk/api` answers
   "No changes detected schema, no migration created" — before this WP it compared the
   schema against a snapshot that never knew the workflow columns.
4. `migrations.spec.ts`: add the guard of `interfaces` above; it fails before step 1 and 2
   and passes after them.
5. Bookkeeping in the same commit: `CHANGELOG.md`, the `work-packages/README.md` row,
   `docs/REPO-MAP.md` (the `schema.ts` row and a `migrations/meta/` row) and `PLAN.md` §16;
   mark the open question of `34-bma-sync-runs-table.md` as closed by this WP.

## Non-goals

- No new migration, no edit of `0006_ticket_workflow_columns.sql`.
- No code writes the workflow columns: `transitionTicket()` still only sets `status`
  (the phase 4 follow-ups do that, `PLAN.md` §7).
- No change to the retention of `report_throttle.ip` or `bma_sync_runs.conflicts`.
- No UI, no i18n, no API payload change.

## Acceptance

```bash
npm run db:generate -w @stoerdesk/api
npm run check
```

Expected: `db:generate` creates **no** migration and leaves the tree clean; `npm run
check` is fully green with a reachable PostgreSQL 16 and
`E2E_CHROMIUM_PATH=/usr/bin/chromium` — the new guard test runs, and the E2E proves that
a fresh throwaway database still migrates through all eleven migrations.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none.
- Open question: none.
