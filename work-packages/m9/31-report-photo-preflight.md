# WP-M9-31: report photo preflight (SEC-014)

format: small-model
status: done
depends-on: WP-M9-30
phase: 9
milestone: m9
context-budget: 14k tokens
spec: PLAN.md §15 (audit — SEC-014); specs/06-report-form.md §7.4
spec-lines: 22

files-read:

- apps/api/src/tickets/report.ts (createPublicReport, transaction, saveReportPhotos)
- apps/api/src/tickets/photos.ts (decodePhoto, saveReportPhotos, PhotoUploadError)
- packages/shared/src/schemas/ticket.ts (photoDataUrlSchema, photos array cap)

files-write:

- apps/api/src/tickets/report.ts
- apps/api/src/tickets/photos.ts

interfaces:

- `validateReportPhotos(photos: string[], maxPhotoBytes: number): void` — count, data
  URL prefix, decoded size and magic bytes checked BEFORE the ticket transaction;
  same `PhotoUploadError` codes the post-transaction save still throws.

## Task

1. `apps/api/src/tickets/photos.ts`: new exported helper `validateReportPhotos` that
   mirrors the length and per-photo decode checks of `saveReportPhotos` and throws the
   same `PhotoUploadError` envelope without writing a byte or a DB row.
2. `apps/api/src/tickets/report.ts` (`createPublicReport`): after `loadEnv()` and
   before the transaction, when `input.photos.length > 0` look up whether `input.clientUuid`
   already exists in `tickets` and, if not, call `validateReportPhotos(input.photos,
   storage.maxPhotoBytes)`. Repeats keep their old gallery and are not re-validated (§7.4).

## Non-goals

- No i18n change, no schema change, no DB migration, no UI change.
- `saveReportPhotos` still re-runs its checks as the last line of defence (unchanged).

## Acceptance

```bash
npm run check
```

Expected: green (no new report spec was added; existing over-limit tests already
expect a 422 photo envelope — the response stays identical, only the transaction
no longer runs).

## Handoff

- Files changed: the two files above
- Interfaces added: `validateReportPhotos`
- Verified: `npm run check`
- Follow-up WP: WP-M9-32 (branding logo magic-byte check, SEC-019)
- Open question: none
