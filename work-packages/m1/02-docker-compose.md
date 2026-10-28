# WP-M1-02: Docker Compose

depends-on: WP-M1-01
milestone: m1

## Ziel

Compose-Stack mit `app` (später), `db` (Postgres 16), optional `ntfy`.
Healthcheck, Volume für Uploads, `.env.example`.

## Spec-Referenzen

- specs/00-conventions.md §Stack
- specs/14-nfr.md §Verfügbarkeit

## Aufgabe

1. `docker-compose.yml` mit `db` (Postgres 16, Healthcheck, Volume `pgdata`)
2. `Dockerfile` (multi-stage: build, runtime)
3. `.env.example` vollständig dokumentiert (DB, Session-Secret, VAPID, SMTP, ntfy, Telegram)
4. `.gitignore` (node_modules, .env, data/uploads, dist)
5. `docker-compose.dev.yml` (nur db, für lokale Entwicklung)

## Akzeptanz

- `docker compose up db` startet Postgres 16 mit Healthcheck
- `.env.example` enthält alle in specs/00 genannten Variablen
