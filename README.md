> **Wichtiger Hinweis:** StörDesk ist **kein** Notrufweg. Bei akuter Gefahr für
> Menschen, Feuer, Explosion oder medizinischen Notfällen gilt weiterhin **112**
> (Feuerwehr und Rettungsdienst) bzw. **110** (Polizei). Die 112 wird zusätzlich
> auf gedruckten Aufklebern und im Meldeformular angezeigt.

# StörDesk

Störungsdesk für Objekte und Anlagen: Störungen melden, nachverfolgen und bearbeiten.

- **apps/web** — React + Vite PWA (i18next, TanStack Query, Tailwind)
- **apps/api** — Fastify + Drizzle + PostgreSQL + pg-boss
- **packages/shared** — Zod-Schemas, Typen, Permission-Konstanten, i18n-Ressourcen

Lizenz: MIT — siehe [LICENSE](LICENSE).

## Status

Die Umgebung ist eingerichtet, die fachliche Umsetzung **steht noch aus**. Grundlage
sind die Spezifikation in [`specs/`](specs/) und die Arbeitspakete in
[`work-packages/`](work-packages/). Details: [`docs/REPO-MAP.md`](docs/REPO-MAP.md).

## Schnellstart

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000 (Health: `/api/v1/health`)

Datenbank lokal (nur Postgres 16):

```bash
docker compose -f docker-compose.dev.yml up -d db
```

## Qualitätssicherung

```bash
npm run check        # Typecheck, Lint, Tests, i18n:check
npm run i18n:check   # Key-Parität de/en
npm run format       # Prettier
```

## Werkzeuge

| Kommando                    | Wirkung                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `npm run dev`               | Startet Web und API im Watch-Modus                          |
| `npm run build`             | baut Web (Vite) und API (esbuild)                           |
| `npm run typecheck`         | TypeScript in allen Workspaces                              |
| `npm run lint` / `lint:fix` | ESLint (flat config)                                        |
| `npm run test:run`          | Vitest in allen Workspaces                                  |
| `npm run i18n:check`        | prüft Locale-Parität und referenzierte Keys                 |
| `npm run spec:split`        | zerlegt `docs/material/PFLICHTENHEFT.md` nach `specs/`      |
| `npm run orchestrate`       | führt die Prüfschritte nacheinander mit Zusammenfassung aus |

## Beiträge

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) — Conventional Commits, DCO-Sign-off,
ein Work Package pro Commit.
