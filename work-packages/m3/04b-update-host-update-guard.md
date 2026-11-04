# WP-M3-04b: der Startbefehl verweigert sich ohne `docker-compose.yml`

format: small-model
status: implemented
depends-on: WP-M3-04
phase: 3
milestone: m3
context-budget: 8k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 10

files-read:

- apps/web/src/admin/update-host-update.tsx — der Startbefehl von WP-M3-04
- docs/DEPLOYMENT.md — die Dokumentation des Startbefehls

files-write:

- apps/web/src/admin/update-host-update.tsx
- docs/DEPLOYMENT.md

interfaces:

- der Startbefehl auf `/admin/update` bricht mit `exit 1` ab, wenn der aktuelle
  Ordner keine `docker-compose.yml` enthält

## Task

WP-M3-04 ließ den Startbefehl in jedem Ordner laufen: fehlte dort die
`docker-compose.yml`, lief `docker compose` in den falschen Ordner und scheiterte
mit einer undurchsichtigen Compose-Fehlermeldung (oder schrieb eine `.env` an
den falschen Ort). Füge einen Guard voran:

1. `[ -f docker-compose.yml ] || { echo ... >&2; exit 1; }` vor dem
   `.env`-Bootstrap und vor `docker compose`, sodass der Befehl nie in einem
   Ordner ohne Compose-Datei ausgelöst wird.
2. Korrigiere dabei die Shell-Syntax des `.env`-Blocks: die `|| { ...; }`-Gruppe
   um `docker exec … printenv` musste den folgenden Befehl nicht unconditionally
   mit `exit 1` beenden.
3. Dokumente den Guard in `docs/DEPLOYMENT.md` (Snippet + Absatz).

## Non-goals

- Keine Prüfung, ob die `.env`-Werte korrekt sind (der laufende Stack ist die
  Autorität).
- Keine Änderung des Agents oder von `scripts/update.sh`.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run check
sh -n <extrahierter Befehl>
```

Expected: alles grün. Ein Mock-`docker` beweist: ohne `docker-compose.yml`
bricht der Befehl mit `exit 1` und Klartext ab, bevor Compose oder `.env`
angetastet werden; mit `docker-compose.yml` läuft er wie unter WP-M3-04.

## Handoff

- Files changed: `apps/web/src/admin/update-host-update.tsx`,
  `docs/DEPLOYMENT.md`, der changelog und die Backlog-Tabellen
- Interfaces added: keine — der Startbefehl text plus Guard
- Verified: `npm run check` (e2e skipped: kein Chromium in diesem Container),
  Mock-`docker` für beide Zweige des Guards
- Open question: none
