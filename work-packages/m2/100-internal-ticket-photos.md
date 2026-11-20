# WP-M2-100: Photos on internal ticket creation (server + UI)

format: small-model
status: planned
depends-on: WP-M2-15, WP-M2-16
phase: 2
context-budget: 30k tokens
spec: PLAN.md §7 (ticket workflow, rule 1), PLAN.md §10 (report form fields),
  PLAN.md §4.10 (ticket_photos), specs/06-report-form.md §7.4 (photos)
spec-lines: 40

files-read:

- apps/api/src/tickets/internal.ts — POST /api/v1/tickets route + service
- apps/api/src/tickets/report.ts — public report photo pattern (validate + save)
- packages/shared/src/schemas/ticket.ts — internalCreateTicketRequestSchema,
  photoDataUrlSchema
- apps/api/src/index.ts — route registration + env (UPLOAD_DIR, UPLOAD_MAX_BYTES)
- apps/web/src/features/tickets/internal-create-page.tsx — internal create UI
- apps/web/src/features/tickets/photo-upload.tsx — existing PhotoUpload component

files-write:

- packages/shared/src/schemas/ticket.ts — photos on internalCreateTicketRequestSchema
- apps/api/src/tickets/internal.ts — photo validation + storage, route options
- apps/api/src/index.ts — register internalTicketRoutes with uploadDir/maxPhotoBytes
- apps/web/src/features/tickets/internal-create-page.tsx — PhotoUpload + photos body

interfaces:

- `POST /api/v1/tickets` body gains optional `photos: string[]` of base64 data URLs
  (max 6, max `UPLOAD_MAX_BYTES` decoded each, magic bytes `image/jpeg`/`image/png`);
  stored under `<UPLOAD_DIR>/tickets/<ticketId>/<photoId>.<ext>`, `ticket_photos` row
  per photo; `GET /api/v1/tickets/:ticketNo/photos/:photoId` (photoServeRoutes,
  already registered) serves them authenticated.
- `InternalCreatePage` gains the `PhotoUpload` section (label/hint from
  `ticket.report.photos.*` keys that already exist in de/en) and sends `photos`
  in the create body.

## Task

1. `packages/shared/src/schemas/ticket.ts`: add optional `photos` (array of
   `photoDataUrlSchema`, structural max 12, default `[]`) to
   `internalCreateTicketRequestSchema`. Exported type flows through automatically.
2. `apps/api/src/tickets/internal.ts`: `createInternalTicket` validates photos via
   `validateReportPhotos` before the transaction (like `report.ts`), then stores
   them via `saveReportPhotos` after the ticket row exists inside the transaction.
   `InternalTicketRouteOptions` gains `uploadDir`/`maxPhotoBytes`; the route gains
   `bodyLimit` = `6 × UPLOAD_MAX_BYTES` plus base64 headroom and is guarded by
   `ticket.create` (unchanged).
3. `apps/api/src/index.ts`: register `internalTicketRoutes` with
   `{ database, uploadDir: env.UPLOAD_DIR, maxPhotoBytes: env.UPLOAD_MAX_BYTES }`.
4. `apps/web/src/features/tickets/internal-create-page.tsx`: `photos` state, the
   `PhotoUpload` component between the description and contact fields, and the
   `photos` array in the submit body. Reuses `ticket.report.photos.*` i18n keys
   (no new keys; `report.validation.photoLimit` and `report.errors.photo_*` exist
   in de/en).
5. Tests: API integration (store, `photo_type_unsupported`, `photo_limit_exceeded`,
   `photo_too_large`) and UI test (add/remove photo, photos in request body).

## Non-goals

- PDF or non-image documents — the server accepts only JPEG/PNG by magic bytes
  (PLAN §15, SEC-014); anything else is `422 photo_type_unsupported`.
- Offline replay of internal create (the internal form is online-only).

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
```

Expected: all green. Integration tests need a database; without one they skip.

## Handoff

- Files changed: the six files above (4 source + 2 test)
- Interfaces added: `photos` on `POST /api/v1/tickets`, `PhotoUpload` on
  `InternalCreatePage`, `ticket_photos` rows for internal tickets
- Follow-up WP: none (closes the WP-M2-16 non-goal "Photos on internal creation")
