# WP-M4-08: Serve ticket photos and render them as an image gallery

format: small-model
status: in_progress
depends-on: WP-M2-04c, WP-M2-18b
phase: 4
context-budget: 18k tokens
spec: PLAN.md §4.10, §6, §14
spec-lines: 25

files-read:

- apps/api/src/tickets/photos.ts
- apps/api/src/tickets/detail.ts
- apps/api/src/index.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/api/src/tickets/photos.ts — add `photoServeRoutes` (`GET /api/v1/tickets/:ticketNo/photos/:photoId`), guarded by `ticket.read`, streams the stored file with its MIME type
- apps/api/src/index.ts — register `photoServeRoutes` with `uploadDir`
- apps/web/src/features/tickets/ticket-detail-page.tsx — render photos as a clickable thumbnail grid (object URLs via `fetch`), lightbox-style enlarged view on click
- apps/web/src/i18n/locales/{de,en}/ticket.json — `detail.photos.open` / `detail.photos.download` labels

interfaces:

- `GET /api/v1/tickets/:ticketNo/photos/:photoId` — `ticket.read`, answers the image bytes (`content-type` = stored MIME, `content-disposition: inline`) or `{ code, params }` (`photo_not_found`, `ticket_not_found`, `forbidden`)
- no schema or migration change

## Task

1. In `apps/api/src/tickets/photos.ts`, add `photoServeRoutes` (fastify plugin): resolve the ticket by `ticketNo`, verify the photo id belongs to that ticket, read `<UPLOAD_DIR>/<photo.filePath>`, answer the bytes with `content-type: photo.mimeType`. Guard with `requirePermission(database, PERMISSIONS.ticket.read)`. Errors stay `{ code, params }`.
2. Register `photoServeRoutes` in `apps/api/src/index.ts` with `uploadDir: env.UPLOAD_DIR`.
3. In `ticket-detail-page.tsx`, replace the photo metadata list with a responsive thumbnail grid: each photo renders as an `` whose `src` is fetched from the new endpoint (credentials included) and turned into an object URL; clicking a photo opens an enlarged overlay (JS only, no new route). Missing/failed images show a neutral placeholder.
4. Add i18n keys `detail.photos.open` ("Foto öffnen"/"Open photo") and `detail.photos.download` ("Herunterladen"/"Download") in `de` and `en`.

## Non-goals

- No public/anonymous photo access (stays behind the session guard).
- No photo upload change; upload already exists (WP-M2-04c/05b).
- No PDF/E-Mail export (follow-up WPs).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; photos render as images in the ticket detail instead of plain file paths.

## Handoff

- Files changed: (filled at commit)
- Interfaces added: `GET /api/v1/tickets/:ticketNo/photos/:photoId`
- Verified: (filled at commit)
- Follow-up WP: branding logo (WP-M4-09), top-right options dropdown (WP-M4-10)
- Open question: none
