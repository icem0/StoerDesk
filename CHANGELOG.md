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

### Not implemented (by design)

- Sämtliche Fachlogik. Die Umsetzung erfolgt ausschließlich als Work Package
  aus `work-packages/`.
