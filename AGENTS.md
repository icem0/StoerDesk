# AGENTS

Regeln für alle Coding-Agents und Entwickler, die an **StörDesk** arbeiten.

## Aktueller Stand

**Es wird nichts implementiert.** Das Repository enthält derzeit:

- die Spezifikation in `specs/` (Platzhalter je Kapitel),
- die Arbeitsplanung in `work-packages/` (M1, M2),
- die Umgebung (Monorepo, Konfiguration, Skelett, CI, Docker),
- die Dokumentation in `docs/`.

Fachlogik entsteht ausschließlich als Umsetzung eines Work Packages aus
`work-packages/` — WP für WP, nicht gesammelt.

## Architektur

- **Monorepo** mit npm-Workspaces: `apps/*`, `packages/*`.
- **Web** (`apps/web`): React + Vite PWA, i18next, TanStack Query, Tailwind, Dexie.
  Mobile-first, offline-fähig; installierbar als PWA.
- **API** (`apps/api`): Fastify + Drizzle + PostgreSQL + pg-boss.
  Quelle der Wahrheit ist die Datenbank; Tickets laufen über eine State-Machine,
  Benachrichtigungen über eine Outbox, Zeitaufgaben über pg-boss-Jobs.
- **Shared** (`packages/shared`): Zod-Schemas, Typen, Permission-Konstanten,
  i18n-Ressourcen. Kein eigener Build-Schritt — Quellpaket.

## Konventionen

- **Sprache**: Code, Identifier und Kommentare auf Englisch. UI-Texte über
  i18n-Keys (DE Default, EN Referenz). Commit-Messages auf Englisch.
- **Fehler**: `{ code, params }` — niemals übersetzter Text im Protokoll/API-Payload.
- **Logging**: Pino, strukturiert, keine PII im Klartext.
- **Geldbeträge**: keine — StörDesk führt keine Beträge (anders als Lagerprojekte).
- **IDs**: UUID (UUID v7 als Default in der DB), keine laufenden Nummern.
- **Zeitstempel**: Server-Zeit ist maßgeblich.
- **Typen**: TypeScript strict. Kein `any` (Warnung), kein ungetypter Code.
- **Tests**: Vitest für Unit/Integration, Playwright für E2E.

## Datenmodell-Lehren (aus der Spezifikation)

- **Bestand-Logik**: nicht anwendbar — StörDesk verwaltet keine Bestände.
- **Änderungen sind nachvollziehbar**: Ticket-Events sind unveränderlich, Korrekturen
  erfolgen durch neue Events (Audit).
- **Quarantäne**: Sync-Fehler, die nicht automatisch auflösbar sind, werden isoliert
  und blockieren nicht die Bearbeitung.

## Qualität

Nach jeder Änderung sind auszuführen:

```bash
npm run check
```

Das umfasst:

1. `npm run typecheck --workspaces --if-present` — TypeScript je Workspace
   (Web und API haben getrennte `tsconfig.json` wegen unterschiedlicher Libs).
2. `eslint .` — Flat Config in `eslint.config.js`.
3. `vitest run` — Vitest-Projekte je Workspace.
4. `npm run i18n:check` — Parität de/en und referenzierte Keys.

Ergänzend nach Bedarf:

```bash
npm run build      # Web + API bauen
npm run format     # Prettier
```

**Abweichung zu WP-M1-01**: Das Root-Skript `check` nutzt die Workspace-Typechecks
statt eines einzelnen `tsc --noEmit` über alle Pakete, weil API (Node) und Web
(DOM) unterschiedliche `lib`-Sets benötigen. Die Root-`tsconfig.json` bleibt für
Editor und IDE-Support bestehen.

## i18n

- Namespaces Web: `common`, `errors`, `validation`, `ticket`, `object`, `oncall`,
  `stats`, `settings`.
- `de` ist Default und Referenz, `en` muss vollständig sein.
- Keine Literal-Strings in JSX (`i18next/no-literal-string`).
- Neue Namespace-Datei → in `apps/web/src/i18n/index.ts` registrieren, sonst
  schlägt `npm run i18n:check` fehl.

## Commits

- **Conventional Commits** sind Pflicht: `feat(web): ...`, `fix(api): ...`,
  `docs(spec): ...`, `chore(repo): ...`.
- Erlaubte Typen: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **DCO**: Jede Commit-Message endet mit `Signed-off-by: <name> <email>` (`git commit -s`).
- **Ein Work Package = ein Commit.** Der Betreff benennt das WP
  (z. B. `feat(web): WP-M1-09 admin ui users and roles`).
- `commitlint` prüft Format und Sign-off (Husky-Hook `commit-msg`).

## Todo-Liste (Pflicht)

Ab drei Teilschritten wird eine Todo-Liste via `todowrite` geführt:

- alle Schritte zu Beginn als `pending` anlegen,
- genau ein Schritt `in_progress` zur Zeit,
- `completed` erst nach tatsächlicher Verifikation (Lint/Test/Build wirklich gelaufen),
- blockierte Schritte bleiben `in_progress` und benennen den Blocker,
- vor der Abschluss-Antwort keine `pending`/`in_progress` ohne ausdrückliche Nennung.

## Struktur-Disziplin

- Verzeichnisstruktur, Modulübersicht und Konventionen stehen in `docs/REPO-MAP.md`
  (max. 200 Zeilen) und werden **nach jedem Work Package** aktualisiert.
- Neue Module werden in der Modul-Tabelle mit Zweck und öffentlicher API eingetragen.
- Keine Dateien außerhalb der vorgesehenen Bereiche anlegen; `docs/material/` nimmt
  gelieferte Originale auf, `specs/` die daraus gespiegelten Kapitel.

## Datenschutz und Sicherheit

- Keine Secrets im Repository. `.env` ist ignoriert, `.env.example` ist die Vorlage.
- Keine PII in Logs, Tests oder Fixtures.
- 112-Hinweis: auf Meldeformular und Aufklebern sichtbar halten
  (siehe README und `specs/06-report-form.md`).
