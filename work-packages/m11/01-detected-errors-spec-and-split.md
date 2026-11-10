# WP-M11-01: Festgestellte Fehler — Spezifikation, ADR und Phase-11-Split

format: small-model
status: in_progress
depends-on: WP-M10-18
phase: 11
milestone: m11
context-budget: 24k tokens
spec: PLAN.md §16 phase 11, specs/13-detected-errors.md, ADR-0016
spec-lines: 200

files-read:

- PLAN.md (§16 phase roadmap, §17 work-package rules)
- work-packages/m10/01-api-hardening-spec-and-split.md (Phase-10-Split als Format-Muster)
- docs/WP-TEMPLATE.md
- docs/DECISIONS.md (ADR-Index)

files-write:

- specs/13-detected-errors.md (neu)
- docs/DECISIONS/0016-detected-errors.md (neu)
- docs/DECISIONS.md (Index ergänzen)
- work-packages/m11/ (WP-M11-02 … WP-M11-10, jede Datei in diesem Commit)
- PLAN.md §16, work-packages/README.md, docs/REPO-MAP.md, CHANGELOG.md

interfaces:

- `specs/13-detected-errors.md` §13.2 — `detected_errors`-Tabelle, `tickets.detected_error_keys`
- `specs/13-detected-errors.md` §13.3 — API `/api/v1/detected-errors` und Close-Body
- `specs/13-detected-errors.md` §13.4 — Statistik `byDetectedError`, View `stats_ticket_detected_errors`
- ADR-0016
- `work-packages/m11/` — die Phase-11-Pakete in numerischer Implementierungsreihenfolge

## Task

1. `specs/13-detected-errors.md` mit dem Vertrag für den Admin-Katalog, die
   Close-Speicherung, die Statistik-Erweiterung und die UI schreiben.
2. ADR-0016 mit den Entscheidungen (Tabelle, Array, optionales Close-Feld,
   Archivieren statt Löschen, Statistik-Gruppierung) verfassen und den
   `docs/DECISIONS.md`-Index ergänzen.
3. Die Phase-11-Arbeitspakete WP-M11-02 … WP-M11-10 in `work-packages/m11/`
   in numerischer Reihenfolge anlegen (jede Datei in diesem Commit).
4. Den Split in `PLAN.md` §16 (Phase-11-Tabelle), `work-packages/README.md`,
   `docs/REPO-MAP.md` und `CHANGELOG.md` eintragen. Kein Produktivcode in
   diesem Paket.

## Non-goals

- Kein Schema, Service, Route, Job, UI oder Test-Code.
- Keine Phase-10-Arbeit.
- Keine UI, keine API, keine Migration.

## Acceptance

```bash
npm run wp:check
npm run check
```

Erwartet: `wp:check` grün mit jeder neuen WP-Datei gültig; `check` grün, weil
dieses Paket nur Dokumentation ändert. Die E2E-Gate wird als skipped gemeldet,
wenn kein Browser verfügbar ist. Keine Docker-Gate in diesem WP.

## Handoff

- Dateien geändert: die beiden Spec-Slices, ADR-0016, der Entscheidungs-Index,
  die m11-WP-Dateien, `PLAN.md` §16, `work-packages/README.md`,
  `docs/REPO-MAP.md` und `CHANGELOG.md`
- Interfaces hinzugefügt: die Phase-11-Verträge oben
- Verifiziert: `npm run wp:check` und `npm run check` (E2E skipped: kein Chromium)
- Follow-up WP: WP-M11-02 … WP-M11-10 (jede Datei existiert in diesem Commit)
- Offene Frage: keine
