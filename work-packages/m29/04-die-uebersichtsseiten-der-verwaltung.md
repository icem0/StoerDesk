# WP-M29-04: die Übersichtsseiten der Verwaltung

format: ctx-256k
status: planned
depends-on: WP-M29-03
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.11; PLAN.md §14, §16
spec-lines: 50
changed-lines: 480

files-read:

- specs/13-ui.md §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche)
- apps/web/src/settings/settings-menu.tsx (die gemeinsame Liste von WP-M29-03)
- apps/web/src/routes/index.tsx (die Routentabelle)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json (die Menütexte)

files-write:

- apps/web/src/admin/access-page.tsx (neu)
- apps/web/src/admin/workflow-page.tsx (neu)
- apps/web/src/admin/readiness-page.tsx (neu)
- apps/web/src/admin/messaging-page.tsx (neu)
- apps/web/src/routes/index.tsx (vier Routen)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json (Titel, Beschriftungen, Beschreibungen)
- apps/web/src/admin/__tests__/topic-pages.test.tsx (neu)

interfaces:

- `GET /admin/access` — Benutzer, Rollen, Gruppen
- `GET /admin/workflow` — Status, Störungsarten, Eskalation, Standardwerte, Festgestellte Fehler
- `GET /admin/readiness` — Bereitschaftsplan, Meine Bereitschaft
- `GET /admin/messaging` — Kanäle, Zustellungsprobleme, Mailbox des Betriebs, Webhooks, API-Schlüssel, BMAcloud-Abgleich
- `SettingsMenu` (von WP-M29-03) rendert je Abschnitt die Module mit Symbol, Beschriftung und Beschreibung

## Task

1. `apps/web/src/admin/access-page.tsx`: Übersichtsseite „Benutzer & Rechte“ mit den Einträgen Benutzer, Rollen, Gruppen.
2. `apps/web/src/admin/workflow-page.tsx`: Übersichtsseite „Meldungsablauf“ mit den Einträgen Status, Störungsarten, Eskalation, Standardwerte, Festgestellte Fehler.
3. `apps/web/src/admin/readiness-page.tsx`: Übersichtsseite „Bereitschaft“ mit den Einträgen Bereitschaftsplan und Meine Bereitschaft.
4. `apps/web/src/admin/messaging-page.tsx`: Übersichtsseite „Kanäle & Versand“ mit den Einträgen Kanäle, Zustellungsprobleme, Mailbox des Betriebs, Webhooks, API-Schlüssel, BMAcloud-Abgleich.
5. `apps/web/src/routes/index.tsx`: die vier Routen unter `RequireSession`, neben den bestehenden Routen der Verwaltung.
6. `apps/web/src/i18n/locales/de/common.json` und `.../en/common.json`: Titel, Beschriftungen und Beschreibungen der vier Seiten und ihrer Module; die bestehenden Schlüssel `app.settingsItems.*` und `app.settingsItemDescriptions.*` werden um die Module der Verwaltung ergänzt.
7. `apps/web/src/admin/__tests__/topic-pages.test.tsx`: jede Übersichtsseite zeigt ihre Überschrift und ihre Links; die Links führen auf die Zielseiten.

## Non-goals

- Die Zielseiten selbst (Benutzer, Rollen, …) werden nicht verändert (WP-M29-06 baut die gemeinsame Seitenhülle).
- Die Kanalseite wird nicht aufgeteilt (WP-M29-05).
- Keine API-Änderung: die Seiten sind reine Links.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: die vier Übersichtsseiten, routes/index.tsx, die beiden Locales, der neue Test
- Interfaces added: AccessPage, WorkflowPage, ReadinessPage, MessagingPage
- Verified: the commands above
- Follow-up WP: WP-M29-05 (die Kanalseite bekommt eine Seite je Kanal)
- Open question: none
