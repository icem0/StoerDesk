# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung basiert auf [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Added

- Monorepo-Gerüst mit npm-Workspaces (`apps/web`, `apps/api`, `packages/shared`).
- Konfiguration: TypeScript strict, ESLint (Flat Config, i18next-Regel), Prettier,
  Vitest (Root + je Workspace), Husky, commitlint.
- Skripte: `npm run check`, `npm run i18n:check`, `npm run spec:split`, `npm run orchestrate`.
- Docker-Setup: `Dockerfile` (Targets `api`, `web`), `docker-compose.yml`,
  `docker-compose.dev.yml`, `.env.example`.
- CI: `.github/workflows/check.yml` (Node 22, `npm ci`, `npm run check`).
- Spezifikationsstruktur `specs/` (17 Kapiteldateien), Arbeitspakete `work-packages/m1`
  (12) und `work-packages/m2` (10), Dokumentation `docs/` inkl. REPO-MAP und ADR-0001.
- WP-M1-03: Drizzle-Basisschema `apps/api/src/db/schema.ts` mit `users`, `sessions`,
  `groups`, `user_groups`, `settings`; UUID v7 als serverseitiger Default über die Funktion
  `gen_uuid_v7()` (ADR-0002), Migration `0000_base_tables`, Drizzle-Client mit Schema.
- WP-M1-03: Migrationstest (ohne DB) und Integrationstest gegen eine echte Postgres-16-Datenbank
  (`TEST_DATABASE_URL`, leere Wegwerf-Datenbank pro Lauf, Skip ohne erreichbare DB).

### Changed

- Sprachregel verschärft: Code, Kommentare, Testnamen, Commit-Messages und
  Entwickler-Doku sind durchgängig Englisch; die App bleibt mehrsprachig
  (`de` Default, `en` vollständig) — UI-Texte ausschließlich über i18n-Keys.
- README und `AGENTS.md` auf Englisch umgestellt.

### Abweichungen

- WP-M1-01: `npm run check` nutzt die Workspace-Typechecks statt eines `tsc --noEmit` über
  alle Pakete (siehe AGENTS.md); ESLint als Flat Config (`eslint.config.js`) statt `.eslintrc.cjs`.
- WP-M1-03: die erste Migration trägt die von drizzle-kit vergebene Nummer `0000` statt `0001`;
  es ist genau eine Migration vorhanden.

### Noch nicht umgesetzt (by design)

- Sämtliche Fachlogik (Auth, Tickets, Objekte, Oncall, Benachrichtigungen, UI).
  Die Umsetzung erfolgt ausschließlich als Work Package aus `work-packages/` —
  bisher sind nur WP-M1-01 bis WP-M1-03 (Fundament und Datenmodell-Grundtabellen) umgesetzt.
