# WP-M2-50: the `update_runs` table

format: small-model
status: planned
depends-on: WP-M2-49
phase: 2
context-budget: 14k tokens
spec: specs/18-self-update.md §18.4, specs/02-data-model.md
spec-lines: 130

files-read:

- apps/api/src/db/schema.ts — the `bma_sync_runs` table to copy
- apps/api/src/db/migrations/0007_bma_sync_runs.sql — the migration style
- apps/api/src/db/migrations/meta/_journal.json — the migration journal
- apps/api/src/db/migrate.ts — how migrations are applied
- apps/api/src/db/__tests__/bmaSyncRuns.integration.spec.ts — the table test

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0009_update_runs.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/migrations/meta/0009_snapshot.json

interfaces:

- table `update_runs` (modelled on `bma_sync_runs`): `id` uuid v7,
  `started_at`, `finished_at`, `status`, `before_version`, `after_version`,
  `error_code`, `agent_run_id`

## Task

1. Add the table `update_runs` to `apps/api/src/db/schema.ts`: `id` (uuid v7
   default), `startedAt` (not null, default now), `finishedAt`, `status`
   (text, default `RUNNING`, check `RUNNING|SUCCESS|PARTIAL|FAILED`), `beforeVersion`,
   `afterVersion`, `errorCode`, `agentRunId` (the id the agent reported, for the
   reconciliation) and an index on `started_at`.
2. Export the types `UpdateRun` and `NewUpdateRun` and the status list
   `UPDATE_RUN_STATUSES` next to the `bmaSyncRuns` exports.
3. Write the migration `0009_update_runs.sql` in the style of
   `0007_bma_sync_runs.sql` and add it to the journal with its snapshot.

## Non-goals

- No route, no agent, no UI (WP-M2-51 … WP-M2-54).
- No reference to the user who triggered the run — the run row carries the
  technical result, the audit trail stays in `ticket_events`.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the migration
applies cleanly on an empty database and a second run is a no-op.

## Handoff

- Files changed: the four files of `files-write`.
- Interfaces added: the table `update_runs` and its types.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-51 (the agent service core).
- Open question: none.
