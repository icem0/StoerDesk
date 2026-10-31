# WP-M2-05b: Report photo upload in the web form

format: small-model
status: planned
depends-on: WP-M2-05
phase: 2
context-budget: 24k tokens
spec: specs/06-report-form.md §7.2 (up to 6 photos) and §7.4 (data URLs, limits, codes), PLAN.md §10 (client compression 1600 px / JPEG 0.8), §15 (10 MB cap, magic bytes)
spec-lines: 80

files-read:

- specs/06-report-form.md (§7.4 photo transport, limits, error codes)
- PLAN.md (§10 compression rule, §15 upload limits)
- apps/web/src/features/tickets/report-form-page.tsx (the form this package extends)
- packages/shared/src/schemas/ticket.ts (`photoDataUrlSchema`, the `photos` array)
- apps/api/src/tickets/photos.ts (the server limits the client has to match)

files-write:

- apps/web/src/features/tickets/image-compress.ts
- apps/web/src/features/tickets/photo-upload.tsx
- apps/web/src/features/tickets/report-form-page.tsx

interfaces:

- `compressImage(file: Blob, options?: CompressOptions): Promise<CompressedPhoto>` in
  `image-compress.ts` — `createImageBitmap`, longest edge capped at
  `MAX_PHOTO_DIMENSION = 1600`, `canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY)` with
  `0.8`, decoded byte count of the result returned; an undecodable file throws
  `PhotoError('photo_type_unsupported')`
- `PhotoUpload({ photos, onAdd, onRemove })` in `photo-upload.tsx` — file input
  (`accept="image/*"`), previews, remove buttons, the `MAX_REPORT_PHOTOS = 6` client rule
- the page sends `photos: string[]` in the `PublicReportRequest` and maps the codes
  `photo_limit_exceeded`, `photo_too_large`, `photo_type_unsupported` to
  `ticket:report.errors.<code>`; the confirmation shows `report.done.photoCount`

## Task

1. `image-compress.ts`: `compressImage` reads the bitmap, scales proportionally so that
   neither edge exceeds 1600 px (an up-scaling never happens), draws it into a canvas and
   returns the JPEG data URL plus its decoded size. A `BadImageError` (undecodable, or a
   bitmap of 0 px) is reported as `photo_type_unsupported`, never as a silent skip.
2. `photo-upload.tsx`: `PhotoUpload` keeps the photos as data URLs in the page state,
   shows a preview per photo with its byte size and a remove button, and enforces the
   client rule of §7.4 before compressing: adding more than six photos answers
   `ticket:report.validation.photoLimit`. A failed compression renders
   `ticket:report.errors.photo_type_unsupported` and adds nothing.
3. `report-form-page.tsx`: hold `photos: string[]` in state, render `PhotoUpload` between
   the free text and the contact fields, put the array into the submit body and add the
   three photo error codes to the error mapping. The idempotent repeat needs no special
   client case: the server ignores the array of a repeat (§7.4).
4. Tests (fixtures, outside the file budget)
   `apps/web/src/features/tickets/__tests__/photo-upload.test.tsx`: `compressImage` is
   injected, because jsdom has no canvas — the component adds accepted photos, refuses the
   seventh with the limit notice, removes a photo and shows the byte size; a compressor
   that throws leaves the list untouched. `image-compress.test.ts` checks the pure scaling
   math (`scaledSize(width, height, max)`), not the canvas.

## Non-goals

- No server-side re-compression or thumbnails (WP-M2-04c explicitly excluded them), no
  `width_px`/`height_px` decoding into `ticket_photos`.
- No photo **read** or gallery in the ticket detail — phase 10 access package.
- No EXIF orientation correction beyond what `createImageBitmap` already does, no HEIC
  special case: HEIC is rejected by the browser's decoder and surfaces as
  `photo_type_unsupported`.
- No offline photo storage in Dexie — WP-M2-09.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new component tests fail before the files exist and pass after
them. The real browser compression is proven by **WP-M2-05c**, because jsdom has no canvas.

## Handoff

- Files changed: `apps/web/src/features/tickets/image-compress.ts` (new),
  `apps/web/src/features/tickets/photo-upload.tsx` (new),
  `apps/web/src/features/tickets/report-form-page.tsx`, the `ticket` locale files (de/en),
  the module rows in `docs/REPO-MAP.md` and the backlog rows
- Interfaces added: `compressImage`, `CompressedPhoto`, `CompressOptions`, `PhotoError`,
  `scaledSize`, `PhotoUpload`, `MAX_REPORT_PHOTOS`, `MAX_PHOTO_DIMENSION`,
  `PHOTO_JPEG_QUALITY`, `ticket:report.validation.photoLimit`, the three
  `ticket:report.errors.photo_*` keys
- Verified: see the handoff of the implementation commit
- Follow-up WP: `05c-report-form-e2e.md` (photo path in a real browser, created with this
  document)
- Open question: none
