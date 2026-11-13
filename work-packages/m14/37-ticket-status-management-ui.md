# WP-M14-37: Ticket status management UI

format: small-model
status: planned
depends-on: WP-M14-36
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.9, specs/07-escalation.md §7.1
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/lib/api.ts
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

files-write:

- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/status-form.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /api/v1/admin/statuses` — liest alle Stati
- `POST/PATCH/DELETE /api/v1/admin/statuses/:key` — schreibt Stati

## Task

1. `apps/web/src/admin/status-page.tsx`: `StatusPage` — Tabelle aller Stati mit key, Namen (de/en), Farbe, Position, aktiv/terminal; Buttons für Neu/Bearbeiten/Löschen; Guard `settings.write`.
2. `apps/web/src/admin/status-form.tsx`: Dialog/Formular zum Anlegen und Editieren eines Status (key, Namen de/en, Farbe, aktiv, terminal); Validierung clientseitig via Zod.
3. `apps/web/src/i18n/locales/{de,en}/settings.json`: Keys `admin.status.*` (Titel, Spalten, Formular-Labels, Bestätigungsdialoge, Fehler).

## Non-goals

- Keine Änderung am Workflow-Engine (WP-M14-38).
- Keine Eskalations-Aktion (WP-M14-40).
- Keine Integration in die Eskalations-Regeln (WP-M14-40).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: alle grün; `i18n:check` bestätigt de/en Parität für neue Keys; die Seite rendert die neun Seed-Stati; Anlegen/Editieren/Löschen funktioniert gegen die API.

## Handoff

- Files changed: `status-page.tsx`, `status-form.tsx`, `settings.json` (de/en)
- Interfaces added: `StatusPage`, `StatusForm`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-38 (konfigurierbare Transitionen in DB + DB-gestützte Engine)
- Open question (if any): wo in der Navigation/status-Menü die Status-Seite eingebunden wird (WP-M14-01 hat das Admin-Menü bereits ins Settings-Menü verschoben).
