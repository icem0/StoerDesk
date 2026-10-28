# Contributing

Danke für Beiträge an StörDesk.

## Voraussetzungen

- Node.js ≥ 22.12
- npm ≥ 11
- Docker (für Postgres 16 lokal)

## Setup

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db
```

## Branching und Commits

- Feature-Branches von `main`: `feat/wp-m1-09-admin-ui`, `fix/…`, `docs/…`.
- **Conventional Commits**: `feat(web): …`, `fix(api): …`, `docs(spec): …`, `chore(repo): …`.
- **Sprache**: Commit-Messages, Quellcode, Kommentare und Testnamen auf Englisch;
  sichtbare UI-Texte nur über i18n-Keys (siehe `AGENTS.md`).
- **Ein Work Package = ein Commit.** Der Commit-Betreff nennt das WP:
  `feat(web): WP-M1-09 admin ui users and roles`.
- **DCO**: Commits werden mit `git commit -s` signiert. Der `commit-msg`-Hook
  (commitlint) prüft Conventional-Commit-Format und Sign-off.

## Vor dem Push

```bash
npm run check
```

Typecheck, Lint, Tests und i18n:check müssen grün sein. `npm run build` zusätzlich,
wenn Build-Artefakte betroffen sind.

## Pull Requests

- PR-Beschreibung mit Bezug auf das umgesetzte Work Package.
- Verknüpfung mit dem Issue/WP, falls vorhanden.
- Screenshots bei UI-Änderungen, DE und EN.
- Reviewer: mindestens eine Freigabe, bevor gemergt wird.

## Verhalten

Melde Fehler und Verhaltensregeln in `CODE_OF_CONDUCT.md`.
Sicherheitslücken **nicht** als öffentliches Issue melden — siehe `SECURITY.md`.
