# ADR-0001: Monorepo mit npm-Workspaces

- Status: accepted
- Datum: 2026-10-28
- Beteiligte: Projektverantwortung

## Kontext

StörDesk besteht aus einer PWA (`apps/web`), einer API (`apps/api`) und einem geteilten
Paket (`packages/shared`) mit Zod-Schemas, Typen, Permission-Konstanten und i18n-Ressourcen.
Shared-Code wird von beiden Seiten referenziert; die Spezifikation ist in `specs/`
und `work-packages/` organisiert.

## Entscheidung

Ein Repository mit npm-Workspaces (`apps/*`, `packages/*`). `packages/shared` wird als
TypeScript-Quellpaket konsumiert (kein eigener Build-Schritt im Dev-Fluss); API und Web
binden es über Workspace-Auflösung ein.

## Alternativen

- **Getrennte Repositories**: verhindert gemeinsame Änderungen an Schemas und i18n-Ressourcen.
- **pnpm/Turborepo**: mehr Tooling-Aufwand ohne erkennbaren Vorteil bei dieser Größe.
- **Gebautes Shared-Paket (dist)**: erzwingt Build-Reihenfolge und damit Reibung im Dev-Fluss.

## Konsequenzen

- Eine `package-lock.json` für alle Workspaces, `npm ci` installiert alles.
- `npm run check` (Typecheck, Lint, Tests, i18n:check) läuft über alle Workspaces.
- Konsistenz von Shared-Code muss durch Typecheck und Tests abgesichert werden.
