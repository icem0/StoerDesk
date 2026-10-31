# WP-M2-04c: Report photo upload

format: small-model
status: planned
depends-on: WP-M2-04b
phase: 2
context-budget: 20k tokens
spec: specs/06-report-form.md §7.4 (photos), specs/02-data-model.md §4.10 (`ticket_photos`), PLAN.md §15 (magic bytes, 10 MB, uploads volume)
spec-lines: 60

files-read:

- specs/06-report-form.md (§7.4 photo transport, limits, magic bytes, storage path)
- specs/02-data-model.md (§4.10 `ticket_photos`, §4.2 general rules)
- apps/api/src/tickets/report.ts (the create path this package extends)
- packages/shared/src/schemas/ticket.ts (`publicReportRequestSchema`, `publicReport`)
- apps/api/src/config/env.ts (`UPLOAD_DIR`, `UPLOAD_MAX_BYTES`)
- apps/api/src/index.ts (where the report plugin receives its options)

files-write:

- apps/api/src/tickets/photos.ts
- apps/api/src/tickets/report.ts
- packages/shared/src/schemas/ticket.ts
- apps/api/src/index.ts

interfaces:

- `POST /api/v1/public/tickets` accepts `photos: string[]` — base64 data URLs,
  max. 6, each at most `UPLOAD_MAX_BYTES` after decoding; new error codes
  `422 photo_limit_exceeded`, `422 photo_too_large`, `422 photo_type_unsupported`
- `saveReportPhotos(options, ticketId, photos): Promise<StoredPhoto[]>` in
  `apps/api/src/tickets/photos.ts` — magic-byte check, file write under
  `<UPLOAD_DIR>/tickets/<ticketId>/<photoId>.<ext>` and the `ticket_photos` rows
- `detectImageType(buffer): { mime, ext } | null` — `image/jpeg` (`FF D8 FF`) and
  `image/png` (`89 50 4E 47 0D 0A 1A 0A`)
- the report route config raises `bodyLimit` to `6 × UPLOAD_MAX_BYTES × 1.4`

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `photoDataUrlSchema`
   (`data:image/(jpeg|png);base64,<base64>`, single line) and
   `photos: z.array(photoDataUrlSchema).max(12).default([])`. The array bound is
   only structural: the semantic limit of **6** is checked in the service, so the
   client receives `422 photo_limit_exceeded` instead of a body-limit `413`.
2. `apps/api/src/tickets/photos.ts`: decode the data URL, check the decoded size
   against `maxBytes` and the magic bytes against the claimed MIME type, generate
   a UUID v4 file name through `crypto.randomUUID()` and write the file with
   `node:fs/promises` (`mkdir` with `recursive: true` for the ticket directory).
   One `ticket_photos` insert per photo with the path **relative** to
   `UPLOAD_DIR`, the detected MIME type and the decoded byte count. Any rejected
   photo aborts the whole request before a single byte is written.
3. `apps/api/src/tickets/report.ts`: after the ticket transaction, call
   `saveReportPhotos` when `photos.length > 0` and return the real `photoCount`
   in the response; an idempotent repeat ignores its photo array (§7.4) and
   reports the count already stored. The plugin options grow to
   `{ database, uploadDir, maxPhotoBytes }`.
4. `apps/api/src/index.ts`: pass `UPLOAD_DIR` and `UPLOAD_MAX_BYTES` from the
   environment and set the route `bodyLimit`.
5. Tests (fixtures, outside the file budget): extend
   `apps/api/src/tickets/__tests__/report.integration.spec.ts` — a real 1×1 PNG
   and a real JPEG arrive as data URLs, the files exist under a test `UPLOAD_DIR`
   and the rows carry the relative path, MIME type and byte count; a `.png` data
   URL whose bytes are a JPEG answers `422 photo_type_unsupported` and stores
   nothing; a seventh photo answers `422 photo_limit_exceeded`; an oversized photo
   answers `422 photo_too_large`; a repeat with the same `client_uuid` does not
   duplicate the rows or the files.

## Non-goals

- No photo **read** endpoint: `PLAN.md` §15 forbids serving the uploads directory;
  authenticated or signed access is phase 10.
- No `width_px`/`height_px` decoding — the columns stay `NULL` until a decoder is
  worth its dependency.
- No thumbnail or re-compression on the server (the client compresses to
  1600 px/JPEG 0.8, `PLAN.md` §10), no EXIF stripping beyond what the client does.
- No retention job (24-month photo deletion) — phase 10 privacy package.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green with a reachable `TEST_DATABASE_URL`; the new assertions fail
before the upload code exists and pass after it. The test writes only into a
temporary directory (`UPLOAD_DIR` pointed at `os.tmpdir()`), never into `/data`.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — photo **access** is phase 10 and is not announced here
- Open question: none
