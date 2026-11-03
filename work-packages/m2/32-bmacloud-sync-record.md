# WP-M2-32: BMAcloud sync contract (retroactive record)

format: small-model
status: done (retroactive record — commit `a6804ed` landed 2026-11-02 without a work
package and without a WP id in its subject; the implementation it announces is planned
as WP-M2-33 … WP-M2-39)
depends-on: WP-M2-01, WP-M2-02b
phase: 2
context-budget: 16k tokens
spec: specs/17-bmacloud-sync.md §17.1–17.7, PLAN.md §11 (BMAcloud object sync), ADR-0003
spec-lines: 170

files-read:

- specs/17-bmacloud-sync.md — the contract of the pull
- docs/DECISIONS/0003-bmacloud-object-sync.md — the accepted decision
- apps/api/src/db/schema.ts — `objects.external_id` exists since WP-M2-00, `bma_sync_runs` does not
- apps/api/src/config/env.ts — no `BMA_*` key exists
- apps/api/src/jobs/qr-cleanup.ts — the pg-boss shape a sync job has to follow
- .env.example — no `BMA_*` pair

files-write:

- work-packages/m2/32-bmacloud-sync-record.md — this record
- work-packages/m2/33-bmacloud-client.md … 39-object-external-badge.md — the announced
  chain, created in this same commit (`AGENTS.md`: a split creates files, not sentences)
- work-packages/m2/26-admin-back-links.md — its `Follow-up WP:` named
  `27-bmacloud-sync-decision.md`, a file that never existed
- apps/web/apps/web/src/__tests__/diag.test.tsx — deleted: the nested stray copy that
  `a6804ed` committed outside the source tree

interfaces:

- none — this record adds no code; it states what the chain has to build

## Task (what commit `a6804ed` actually did)

1. Added `specs/17-bmacloud-sync.md` (contract of the read-only pull, §17.1–17.7) and
   `docs/DECISIONS/0003-bmacloud-object-sync.md` (accepted ADR with the live verification
   of `GET /anlagen`: 478 Anlagen, `aid` the stable key, `nr` up to 17 characters with
   dots, rate limit 240 requests per window).
2. Added the BMAcloud block to `PLAN.md` §11 and removed the now-decided open question
   "source and format of object data for sync" from `PLAN.md` §19.
3. Added the two `type` exports to `packages/shared/src/schemas/settings.ts` — a drive-by
   of the branding chain, not part of the BMAcloud contract.
4. Committed `apps/web/apps/web/src/__tests__/diag.test.tsx`, a duplicated path outside
   `apps/web/src`; Vitest never picked it up. This record deletes it.
5. Wrote **no implementation**: there is no client, no `bma_sync_runs` table
   (last migration is `0006_ticket_workflow_columns`), no `BMA_API_BASE_URL` /
   `BMA_API_KEY` / `BMA_SYNC_CRON` in the environment schema or `.env.example`, no admin
   route and no admin page. `PLAN.md` §11 is therefore documentation, not behaviour.

## Non-goals

- No code beyond the deletion of the stray test file.
- No new permission key — ADR-0003 reuses `object.read` / `object.write` / `object.import`.
- No BMAcloud write call, no `systems` seeding, no Mängel pull, no contact PII (§17.7).

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green with one WP document less than before the deletion; no test file
disappears from the Vitest run because the deleted file was never collected.

## Handoff

- Files changed: this record, WP-M2-33 … WP-M2-39, the handoff of WP-M2-26, the deleted
  stray test file, plus `work-packages/README.md`, `docs/REPO-MAP.md`, `PLAN.md` §16,
  `CHANGELOG.md`
- Interfaces added: none
- Verified: `npm run check` green (E2E 8/8 with `E2E_CHROMIUM_PATH`)
- Follow-up WP: WP-M2-33 … WP-M2-39 (files created with this record)
- Open question: retention of `bma_sync_runs.conflicts` — it can contain object names of
  the tenant; `PLAN.md` §15 retention is decided in the CSV/privacy WP of phase 10
