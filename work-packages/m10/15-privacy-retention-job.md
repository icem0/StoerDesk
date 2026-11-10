# WP-M10-15: Privacy retention job

format: small-model
status: done
depends-on: WP-M10-14
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/14-nfr.md §15.2; docs/DECISIONS/0014-privacy-retention-and-restore-drill.md
spec-lines: 100

files-read:

- specs/14-nfr.md (§15.2)
- docs/DECISIONS/0014-privacy-retention-and-restore-drill.md
- apps/api/src/jobs/qr-cleanup.ts (job pattern)
- apps/api/src/db/schema.ts (tickets, photos, throttle, bma runs)
- apps/api/src/settings/dashboard.ts (settings keys with defaults)
- apps/api/src/index.ts (direct-start job wiring)

files-write:

- apps/api/src/jobs/privacy-retention.ts
- apps/api/src/settings/privacy.ts
- apps/api/src/index.ts

interfaces:

- `runPrivacyRetention(database, options)`
- pg-boss queue `privacy-retention`, daily at 03:30
- settings `privacy.contact_retention_months`, `privacy.photo_retention_months`

## Task

1. Read the two retention settings with the 24-month defaults.
2. Anonymise reporter contact fields of closed tickets in batches of 500.
3. Delete expired photo files and rows; tolerate a missing file.
4. Delete `report_throttle` rows older than 30 days and `bma_sync_runs` older
   than 365 days.
5. Start the job only in the direct API start and log aggregate counters only.

## Non-goals

- No admin settings UI beyond the stored keys.
- No ticket deletion.
- No export/erase route (WP-M10-16).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; an integration test proves anonymisation, photo deletion,
idempotency and untouched open tickets.

## Handoff

- Files changed: the job, the settings helper and the server start
- Interfaces added: the retention job
- Verified: the commands above; `apps/api/src/jobs/__tests__/privacy-retention.integration.spec.ts` proves the anonymisation, the photo row and file deletion with a missing file, the throttle and sync-run windows, the idempotency, the untouched open ticket and the 24-month defaults against a real database
- Follow-up WP: WP-M10-16, WP-M10-17
- Open question: none
