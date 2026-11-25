# WP-M29-10: die Einstellungen behalten ihre Pfade

format: ctx-256k
status: planned
depends-on: WP-M29-05
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.10, §14.11; PLAN.md §14, §16; docs/DECISIONS.md ADR-0051
spec-lines: 140
changed-lines: 520

files-read:

- specs/13-ui.md §14.10 (das Menü der Einstellungen), §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap)
- apps/web/src/settings/settings-page.tsx (das Menü mit den vier Themen-Seiten)
- apps/web/src/settings/settings-menu.tsx (die gemeinsame Liste)
- apps/web/src/settings/__tests__/settings-page.test.tsx (die Prüfungen des Menüs)
- apps/web/src/components/icon.tsx (die Symbole von WP-M29-02)
- apps/web/src/routes/index.tsx (die Routen der Themen-Seiten)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- docs/DECISIONS/0051-the-settings-menu-is-single-column-and-has-topic-pages.md
- docs/REPO-MAP.md (die Modultabelle)

files-write:

- apps/web/src/components/icon.tsx
- apps/web/src/settings/settings-menu.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/settings/__tests__/settings-page.test.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/admin/access-page.tsx, apps/web/src/admin/workflow-page.tsx, apps/web/src/admin/readiness-page.tsx, apps/web/src/admin/messaging-page.tsx, apps/web/src/admin/__tests__/topic-pages.test.tsx (entfernt)
- apps/web/src/routes/index.tsx
- specs/13-ui.md
- docs/DECISIONS/0051-the-settings-menu-is-single-column.md, docs/DECISIONS.md
- PLAN.md, CHANGELOG.md, docs/REPO-MAP.md

interfaces:

- `Icon` — zwei neue Symbole: `clock` (die eigene Bereitschaft) und `printer` (die Aufkleberbögen)
- `SettingsMenu` — der Abstand zwischen Symbol und Text (`gap-3`), das Symbol steht nicht mehr am Text
- `GET /settings` — das Menü nennt wieder jedes Modul mit seinem Pfad; die vier Themen-Seiten und ihre Routen entfallen

## Task

Das Menü der Einstellungen war einspaltig, sortiert und trug Symbol und
Beschreibung — aber es hatte den Pfad zu jedem Modul der Verwaltung verloren: statt
„Benutzer“, „Rollen“, „Gruppen“ … stehen dort nur vier Themen-Seiten, und die Module
liegen eine Ebene tiefer. Das ist nicht „besser sortieren“, das ist „Wegnehmen“.

1. `apps/web/src/settings/settings-page.tsx`: das Menü nennt wieder jedes Modul mit
   seinem Pfad — „Mein Bereich“ (Meine Einstellungen, Benachrichtigungen, Meine
   Bereitschaft), „Darstellung“ (Darstellung & Logo, Dashboard & TV), „Objekte“
   (Objekte, QR-Aufkleber, Sticker-Vorlage) und „Verwaltung“ (Benutzer, Rollen,
   Gruppen, Status, Störungsarten, Festgestellte Fehler, Eskalation, Standardwerte,
   Bereitschaftsplan, Kanäle, Zustellungsprobleme, Mailbox des Betriebs, Webhooks,
   API-Schlüssel, BMAcloud-Abgleich). Die Symbole und die Kurzbeschreibungen bleiben.
2. `apps/web/src/settings/settings-menu.tsx`: das Symbol bekommt Abstand zum Text
   (`gap-3`) — es stand bisher direkt am Text und überlappte ihn.
3. `apps/web/src/components/icon.tsx`: zwei Symbole kommen dazu — `clock` (die eigene
   Bereitschaft) und `printer` (die Aufkleberbögen), damit kein Symbol zweimal
   dieselbe Sache bedeutet.
4. Die vier Themen-Seiten (`access-page.tsx`, `workflow-page.tsx`,
   `readiness-page.tsx`, `messaging-page.tsx`), ihre Routen und ihr Test entfallen:
   das Menü trägt die Module selbst, eine Ebene dazwischen wäre wieder ein Weg.
5. `apps/web/src/i18n/locales/de/common.json` und `.../en/common.json`: die Schlüssel
   der Themen-Seiten (`access`, `workflow`, `readiness`, `messaging`) entfallen; die
   Schlüssel der Module stehen schon da und tragen jetzt ihre Beschriftung.
6. `specs/13-ui.md` §14.11 und ADR-0051 nennen die neue Regel: das Menü listet jedes
   Modul mit seinem Pfad, jeder Kanal hat seine eigene Seite.
7. `apps/web/src/settings/__tests__/settings-page.test.tsx`: die Prüfungen nennen die
   Module und ihre Pfade wieder.

## Non-goals

- Die Kanalseite behält ihre eigene Seite je Kanal (`/admin/channels/:kind`, WP-M29-05).
- Der Ton des Alarms (WP-M25-09) und das Abzeichen der Zustellprobleme bleiben, wo sie sind.
- Kein neues Symbolbild — die Symbole bleiben die handgeschriebenen der Oberfläche.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; der Test des Menüs schlägt vor der Änderung fehl und danach
grün; `npm run i18n:check` meldet keinen unbenutzten Schlüssel.

## Handoff

- Files changed: icon.tsx, settings-menu.tsx, settings-page.tsx, settings-page.test.tsx, die beiden Locales, routes/index.tsx, specs/13-ui.md, ADR-0051, PLAN.md, CHANGELOG.md, docs/REPO-MAP.md; die vier Themen-Seiten und ihr Test sind entfernt
- Interfaces added: `Icon` mit `clock` und `printer`
- Verified: the commands above
- Follow-up WP: WP-M29-07 … WP-M29-09 (die gemeinsame Seitenhülle der Verwaltung, das Ausgangskriterium der Phase)
- Follow-up WP: WP-M29-11 (die Abschnitte des Menüs klappen nicht zu — jeder Eintrag steht sichtbar da)
- Open question: none
