# WP-M11-03: API — CRUD `/api/v1/detected-errors`

format: small-model
status: planned
depends-on: WP-M11-02
phase: 11
milestone: m11
context-budget: 20k tokens
spec: specs/13-detected-errors.md §13.3
spec-lines: 80

files-read:

- packages/shared/src/schemas/text-template.ts (Schema-Muster)
- apps/api/src/settings/text-templates.ts (Route-Muster, `settings.read`/`settings.write`)
- packages/shared/src/index.ts (Barrel-Export)
- apps/api/src/index.ts (Route-Registrierung)

files-write:

- packages/shared/src/schemas/detected-error.ts (neu)
- apps/api/src/settings/detected-errors.ts (neu)
- packages/shared/src/index.ts (Export ergänzen)

interfaces:

- `detectedErrorSchema`, `detectedErrorCreateRequest`, `detectedErrorUpdateRequest`, `detectedErrorResponse`
- `detectedErrorsRoutes` — `GET/POST/PATCH/DELETE /api/v1/detected-errors`

## Task

1. Zod-Verträge in `packages/shared/src/schemas/detected-error.ts`: `key`
   (trimmed, min 1, machine key), `label_de`/`label_en` (trimmed, min 1),
   optionaler `archived_at`.
2. Fastify-Plugin `apps/api/src/settings/detected-errors.ts`:
   - `GET` (Liste, `settings.read`) — alle Keys mit Labels und `archived_at`
   - `POST` (Anlegen, `settings.write`) — `409 detected_error_key_taken` bei
     doppeltem Key
   - `PATCH /:key` (Bearbeiten, `settings.write`) — Labels und
     `archived_at` setzen/entfernen; `404 detected_error_not_found`
   - `DELETE /:key` (Löschen, `settings.write`) — nur wenn kein Ticket den
     Key trägt, sonst `409 detected_error_in_use`
3. Barrel-Export in `packages/shared/src/index.ts` ergänzen.
4. Route in `apps/api/src/index.ts` registrieren.

## Non-goals

- Keine UI, keine Statistik, keine Close-Integration.
- Keine Soft-Delete-Semantik für Keys (archivieren statt löschen).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
```

Erwartet: Typecheck grün; Integrationstests (WP-M11-09) beweisen CRUD gegen
echte DB.

## Handoff

- Dateien geändert: `detected-error.ts`, `detected-errors.ts`, `index.ts`
- Interfaces hinzugefügt: `detectedErrorsRoutes` plus Schemas
- Verifiziert: Typecheck grün
- Follow-up WP: WP-M11-04
- Offene Frage: keine
