# WP-M11-06: Admin-UI — `DetectedErrorsPage` (CRUD, archivieren)

format: small-model
status: planned
depends-on: WP-M11-03
phase: 11
milestone: m11
context-budget: 20k tokens
spec: specs/13-detected-errors.md §13.5
spec-lines: 60

files-read:

- apps/web/src/admin/deadlines-page.tsx (CRUD-Muster, `apiFetch`, `useQuery`/`useMutation`)
- apps/web/src/i18n/locales/{de,en}/settings.json (i18n-Muster)
- apps/web/src/i18n/index.ts (Namespace-Registrierung)
- apps/web/src/routes/index.tsx (Route-Registrierung)

files-write:

- apps/web/src/admin/detected-errors-page.tsx (neu)
- apps/web/src/i18n/locales/de/settings.json (Änderung: `settings.detectedErrors.*`)
- apps/web/src/i18n/locales/en/settings.json (Änderung: `settings.detectedErrors.*`)
- apps/web/src/routes/index.tsx (Route-Eintrag `/admin/detected-errors`)

interfaces:

- `DetectedErrorsPage` Komponente
- i18n `settings.detectedErrors.*` (de/en)

## Task

1. `apps/web/src/admin/detected-errors-page.tsx`: Seite `/admin/detected-errors`
   mit Tabelle (key, de, en, status, usage), Anlegen/Bearbeiten (key + beide
   Sprachen), Archivieren/Reaktivieren, Löschen (blockiert bei Nutzung →
   `409 detected_error_in_use`). Geschützt mit `settings.write` (lesen:
   `settings.read`); ohne Schreibrecht bleiben die Inputs read-only (wie
   `DeadlinesPage`).
2. i18n-Keys unter `settings.detectedErrors.*` in de und en (Tabelle, Form,
   Buttons, Errors).
3. Route in React Router registrieren; Admin-Home-Modul-Eintrag ergänzen (wie
   `deadlines`, `textTemplates`).

## Non-goals

- Statistik-UI, Close-UI, Offline.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
```

Erwartet: Typecheck grün; `i18n:check` grün (de/en Parität, keine Literals);
Vitest UI-Test (skippbar ohne Browser).

## Handoff

- Dateien geändert: `detected-errors-page.tsx`, beide `settings.json`,
  `index.ts`, `routes/index.tsx`
- Interfaces hinzugefügt: `DetectedErrorsPage`
- Verifiziert: Typecheck grün, i18n:check grün
- Follow-up WP: WP-M11-07
- Offene Frage: keine
