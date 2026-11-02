# WP-M2-27: Show a hint when internal ticket creation fails

format: small-model
status: planned
depends-on: WP-M2-16
phase: 2
context-budget: 18k tokens
spec: PLAN.md §3 (error contract), PLAN.md §10 (report form)
spec-lines: 60

files-read:

- PLAN.md §3, §10
- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/lib/api.ts
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `POST /api/v1/tickets` — answers `{ code, params }` with codes `invalid_request`, `session_invalid`, `object_not_found`, `system_not_found`, `ticket_create_failed`

## Task

When a staff member creates a ticket through `POST /api/v1/tickets` and the request
fails, the page currently shows only `internal.create.errors.unknown`
("Die Meldung konnte nicht erstellt werden.") for every error that is not a 422
with `system_not_found`. The user gets no hint about what is wrong.

1. Map every error code the server can return to a specific i18n key:
   - `invalid_request` → `invalidRequest` ("Bitte prüfen Sie die Eingaben.")
   - `session_invalid` → new key `sessionInvalid` (sitzung abgelaufen)
   - `object_not_found` → new key `objectNotFound` (Objekt existiert nicht mehr)
   - `system_not_found` → `systemNotFound` (already mapped)
   - `ticket_create_failed` → new key `ticketCreateFailed` (technischer Fehler)
   - anything else / no code → `unknown`
2. Add the new keys to `de` and `en` ticket.json under `internal.create.errors`,
   keeping de/en parity.
3. Import `ApiError` from `../../lib/api` and branch on `error.code` instead of on
   `status === 422`.

## Non-goals

- No API change; the server already answers `{ code, params }`.
- No change to the public report form (`report-form-page.tsx`).
- No new permissions or routes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run --project apps/web
npm run i18n:check
npm run wp:check
```

Expected result: all green.

## Handoff

- Files changed:
- Interfaces added: none (reuses `ApiError`)
- Verified:
- Follow-up WP: none
- Open question (if any): none
