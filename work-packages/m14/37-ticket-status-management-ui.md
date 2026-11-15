# WP-M14-37: Ticket status management UI

format: small-model
status: done
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
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/{de,en}/{settings,common}.json

interfaces:

- `GET /api/v1/admin/statuses` — liest alle Stati
- `POST/PATCH/DELETE /api/v1/admin/statuses/:key` — schreibt Stati

## Task

1. `apps/web/src/admin/status-page.tsx`: `StatusPage` — Tabelle aller Stati mit key, Namen (de/en), Farbe, Position, aktiv/terminal; Buttons für Neu/Bearbeiten/Löschen; Guard `settings.write`.
2. `apps/web/src/admin/status-form.tsx`: Dialog/Formular zum Anlegen und Editieren eines Status (key, Namen de/en, Farbe, aktiv, terminal); Validierung clientseitig via Zod.
3. `apps/web/src/i18n/locales/{de,en}/settings.json`: Keys `admin.status.*` (Titel, Spalten, Formular-Labels, Bestätigungsdialoge, Fehler); `apps/web/src/i18n/locales/{de,en}/common.json`: `auth.links.statuses`.
4. `apps/web/src/routes/index.tsx`: Route `/admin/statuses` behind `RequireSession`. `apps/web/src/settings/settings-page.tsx`: the menu entry `statuses` in the administration group.

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

Expected: alle grün; `i18n:check` bestätigt de/en Parität für neue Keys; `apps/web/src/admin/__tests__/status-page.test.tsx` proves the table, the guards, the create/edit buttons and the `409 status_in_use`/`409 status_last_active` answers of a delete.

## Handoff

- Files changed: `status-page.tsx`, `status-form.tsx`, `routes/index.tsx`, `settings-page.tsx`, `settings.json` + `common.json` (de/en), test `status-page.test.tsx`
- Interfaces added: `StatusPage` (`/admin/statuses`), `StatusForm`
- Verified: `npm run check` green (typecheck, eslint, vitest 1255 tests, `i18n:check`, `wp:check` and the 14 Playwright e2e tests)
- Follow-up WP: WP-M14-38 (konfigurierbare Transitionen in DB + DB-gestützte Engine)
- Open question (if any): resolved — the page is a route `/admin/statuses` and an entry of the administration group of the settings menu.
