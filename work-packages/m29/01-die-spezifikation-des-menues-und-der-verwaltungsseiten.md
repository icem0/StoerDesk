# WP-M29-01: die Spezifikation des Menüs und der Verwaltungsseiten

format: ctx-256k
status: done
depends-on: —
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.10, §14.11; PLAN.md §14, §16; docs/DECISIONS.md ADR-0051
spec-lines: 140
changed-lines: 230

files-read:

- PLAN.md §14 (Benutzeroberfläche) und §16 (Phasen-Roadmap, aktueller Stand)
- specs/13-ui.md §14 (Die Oberfläche)
- apps/web/src/settings/settings-page.tsx (das heutige Einstellungsmenü)
- docs/DECISIONS.md (Index der ADRs, nächste Nummer ADR-0051)

files-write:

- specs/13-ui.md (§14.10 Das Menü der Einstellungen, §14.11 Die Verwaltungsseiten)
- docs/DECISIONS/0051-das-menue-der-einstellungen-ist-einspaltig.md
- docs/DECISIONS.md (Index-Zeile für ADR-0051)
- PLAN.md (§14 zwei neue Anforderungen, §16 Phase-26/29-Zeile und Statusabsatz)
- work-packages/README.md (Phasentabelle Zeile m29, Backlog-Tabelle WP-M29-01 … WP-M29-09)

interfaces:

- `Spec §14.10` — Das Menü der Einstellungen ist einspaltig; jeder Eintrag trägt ein Symbol und eine Kurzbeschreibung; ein Suchfeld filtert Name und Beschreibung; die Abschnitte sind aufklappbar; Arbeitsflächen (Meldungen, Statistik, „Neue Störung melden") und das Duplikat „Meine Bereitschaft" verlassen das Menü.
- `Spec §14.11` — Jedes Thema der Verwaltung hat eine eigene Übersichtsseite (Benutzer & Rechte, Meldungsablauf, Bereitschaft, Kanäle & Versand); jeder Kanal bekommt seine eigene Seite (`/admin/channels/:kind`, z. B. Matrix); die Seiten teilen eine Hülle mit genau einem `<main>`-Landmark, Titel und Rücklink.

## Task

1. `specs/13-ui.md` gewinnt die Abschnitte §14.10 (Das Menü der Einstellungen) und §14.11 (Die Verwaltungsseiten) mit dem Zielbild und den Pflichten (eine Spalte, Symbole, Beschreibungen, Suche, aufklappbare Abschnitte, eigene Themen-Seiten, eigene Kanal-Seiten, ein `<main>` pro Seite).
2. `docs/DECISIONS/0051-das-menue-der-einstellungen-ist-einspaltig.md` fasst ADR-0051: das Einstellungsmenü löst die flache Liste der 26 Module ab und zeigt statt vier übersichtlicher Themen-Seiten; ein Symbol gehört zu jedem Eintrag; die Entscheidung „das Administrations-Home ist weg" (WP-M14-01) wird bewusst umgekehrt, weil die flache Liste 30 Einträge untereinander presst.
3. `PLAN.md` bekommt die Phase-29-Zeile in §16 und den Statusabsatz unter „Current state and open backlog"; §14 ergänzt die beiden Anforderungen.
4. `work-packages/README.md` bekommt die Phasen-Zeile für m29 und die Backlog-Zeilen für WP-M29-01 … WP-M29-09 (alle `planned`).
5. `npm run wp:check` validiert das neue Dokument.

## Non-goals

- Keine Code-Änderung: kein Icon, kein Menü, keine Übersichtsseite, keine Route.
- Keine neuen i18n-Schlüssel (die Spec benennt sie nur).
- Kein weiterer WP neben diesem Dokument.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `wp:check` reports no failed WP; the new WP file passes its own validation.

## Handoff

- Files changed: `specs/13-ui.md`, `docs/DECISIONS/0051-...md`, `docs/DECISIONS.md`, `PLAN.md`, `work-packages/README.md`
- Interfaces added: Spec §14.10, Spec §14.11, ADR-0051
- Verified: `npm run wp:check` is green
- Follow-up WP: WP-M29-02 … WP-M29-09 (each its own WP file, created with this commit)
- Open question: none
