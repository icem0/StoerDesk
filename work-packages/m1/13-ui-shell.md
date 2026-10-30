# WP-M1-13: UI-Layout-Shell mit Header und Navigation

format: small-model
depends-on: WP-M1-12
phase: 1
context-budget: 20k tokens
spec: PLAN.md §14 (UI: mobile-first, zwei Spalten, alle Texte via i18n)
spec-lines: 30

files-read:

- apps/web/src/App.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/auth/login-form.tsx
- apps/web/src/i18n/index.ts
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/App.tsx
- apps/web/src/routes/index.tsx

interfaces:

- `Shell()`: feste Kopfzeile (App-Titel, angemeldeter Nutzer, Abmelden), linke Navigation zu `/admin/users` und `/admin/roles`, Hauptbereich mit `max-w-3xl` Inhalt. Nutzt vorhandene i18n-Keys (`app.title`, `auth.signedInAs`, `auth.links.users`, `auth.links.roles`); keine neuen Namespaces oder Schlüssel.

## Task

1. `apps/web/src/components/Shell.tsx` (neu): Layout-Shell mit `<header>`, `<nav>` und `<main>`. Header zeigt `app.title`, `auth.signedInAs` und den `LogoutButton`; die Navigation zeigt `auth.links.users` / `auth.links.roles` mit aktivem Zustand. Beim nicht-authentifizierten Zustand wird `LoginForm` angezeigt, danach der `Outlet`-Inhalt. Dunkles Slate-Theme, konsistente Abstände.
2. `apps/web/src/App.tsx`: rendert nur noch `<Shell />`; die eigene Navigation und die angemeldet-Anzeige weichen in die Shell.
3. `apps/web/src/routes/index.tsx`: Admin-Routen werden unter `/` geschachtelt, damit `Shell` sie umschließt; `RequireSession` bleibt der Guard für `/admin/*`.

## Non-goals

- Keine Sprachumschaltung (kommt mit specs/13-ui.md).
- Keine Änderungen an den Admin-Formularen oder Tabellen selbst (bleiben funktional).
- Keine API-Änderungen, keine neuen i18n-Schlüssel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Die Shell rendert Header, Navigation und Hauptbereich; `/admin/users` und `/admin/roles` erscheinen in der Sidebar; Abmelden funktioniert weiterhin.

## Handoff

- Neue Datei: `apps/web/src/components/Shell.tsx`
- Geänderte Dateien: `App.tsx`, `routes/index.tsx`, beide `common.json`
- Folge-WP: WP-M2-00 (Phase 2, blockiert bis specs/02-data-model.md gefüllt ist)
