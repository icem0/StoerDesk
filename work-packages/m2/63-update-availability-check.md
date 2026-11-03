# WP-M2-63: Update-Verfügbarkeit prüfen und über Weboberfläche auslösen

format: small-model
status: implemented
depends-on: WP-M2-61
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.3
spec-lines: 130

files-read:

- apps/web/src/admin/update-host-update.tsx — der Host-Update-Bereich von WP-M2-55
- apps/web/src/lib/version.ts — die appVersion (aus der VERSION-Datei)
- apps/web/src/i18n/locales/de/settings.json — die deutschen Texte
- apps/web/src/i18n/locales/en/settings.json — die englischen Texte

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- neuer Button „Update prüfen“, der bei GitHub (api.github.com/repos/icem0/StoerDesk/tags) den neuesten Tag liest und mit der laufenden Version vergleicht
- bei neuer Version: Meldung „Update verfügbar“ und der Button „Jetzt updaten“, der den bestehenden Host-Update (POST /api/v1/admin/update/run) auslöst

## Task

1. Erweitere `apps/web/src/admin/update-host-update.tsx`:
   - Button „Update prüfen“; währenddessen Ladezustand
   - Bei Erfolg: neueste Version von GitHub anzeigen
   - Ist die GitHub-Version neuer als die laufende (`appVersion`): Meldung „Update verfügbar“ und der Button „Jetzt updaten“, der den Host-Update startet (bestehender Run-Endpunkt)
   - Ist die Version gleich: „Sie nutzen die neueste Version“
   - Bei Fehler: „Prüfung fehlgeschlagen“
2. Neue i18n-Keys `admin.update.host.checkUpdate`, `admin.update.host.checking`, `admin.update.host.latestVersion`, `admin.update.host.updateAvailable`, `admin.update.host.upToDate`, `admin.update.host.startUpdate`, `admin.update.host.checkFailed` in de und en (gleicher Schlüsselbaum).
3. Erweitere den Test: Prüf-Button ruft GitHub auf, zeigt neueste Version, bietet Update-Button bei neuerer Version.

## Non-goals

- Keine Änderung am API oder am Agent.
- Kein automatisches Update ohne Nutzerklick.
- Kein Changelog oder Release-Notes der neuen Version.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n:check (de und en komplett) und wp:check grün.

## Handoff

- Files changed: die drei Dateien von files-write plus der Test.
- Interfaces added: die i18n-Keys `admin.update.host.checkUpdate.*`.
- Verified: `npm run check` grün.
- Follow-up WP: keiner.
- Open question: keiner.
