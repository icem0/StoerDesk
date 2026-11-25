# WP-M29-11: die Abschnitte des Menüs klappen nicht zu

format: ctx-128k
status: planned
depends-on: WP-M29-10
phase: 29
milestone: m29
context-budget: 18k tokens
spec: specs/13-ui.md §14.10; PLAN.md §14, §16
spec-lines: 40

files-read:

- specs/13-ui.md §14.10 (das Menü der Einstellungen)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap)
- apps/web/src/settings/settings-menu.tsx (die gemeinsame Liste)
- apps/web/src/settings/settings-page.tsx (das Menü mit seinen Abschnitten)
- apps/web/src/settings/__tests__/settings-menu.test.tsx (die Prüfungen des Menüs)

files-write:

- apps/web/src/settings/settings-menu.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/settings/__tests__/settings-menu.test.tsx
- apps/web/src/settings/__tests__/settings-page.test.tsx

interfaces:

- `SettingsMenu({ sections })` — eine Spalte, jeder Abschnitt sichtbar, jeder Eintrag mit Symbol, Label und Kurzbeschreibung
- `SettingsMenuSection` — ein Abschnitt mit Überschrift und Liste; kein Feld `collapsible` mehr

## Task

1. `apps/web/src/settings/settings-menu.tsx`: der Abschnitt kennt kein
   Ausklappen mehr. Das Feld `collapsible` und der Zustand der geschlossenen
   Abschnitte entfallen; jeder Abschnitt rendert seine Überschrift und seine
   Liste. Die Suche bleibt der Filter, der die lange Liste bedienbar macht.
2. `apps/web/src/settings/settings-page.tsx`: der Abschnitt „Verwaltung“ ist
   ein gewöhnlicher Abschnitt — er trägt keine `collapsible`-Eigenschaft mehr
   und steht damit wie „Mein Bereich“, „Darstellung“, „Objekte“ und „Konto“
   offen.
3. `apps/web/src/settings/__tests__/settings-menu.test.tsx`: die Prüfung
   „schließt einen Abschnitt und öffnet ihn wieder“ wird zur Prüfung „hält
   jeden Abschnitt sichtbar“ — beide Überschriften stehen als `h2` da und
   ihre Einträge stehen darunter.
4. `apps/web/src/settings/__tests__/settings-page.test.tsx`: die Prüfung öffnet
   den Abschnitt „Verwaltung“ nicht mehr, weil er offen steht.

## Non-goals

- Die Aufteilung der Abschnitte und ihre Reihenfolge bleiben wie sie sind.
- Die Symbolabstände, die Suche und die Texte der Abschnitte bleiben wie sie
  sind.
- Keine Änderung an den Seiten der Administration selbst.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; der Test der Abschnitte prüft vor der Änderung einen
zusammengeklappten Abschnitt und danach die offenen Abschnitte.

## Handoff

- Files changed: settings-menu.tsx, settings-page.tsx, settings-menu.test.tsx, settings-page.test.tsx
- Interfaces added: keine — das Feld `collapsible` der `SettingsMenuSection` entfällt
- Verified: the commands above
- Follow-up WP: none
- Open question: none
