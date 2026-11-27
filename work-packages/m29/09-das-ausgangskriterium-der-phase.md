# WP-M29-09: the exit criterion of the phase

format: ctx-256k
status: done
depends-on: WP-M29-08
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.10, §14.11; PLAN.md §14, §16
spec-lines: 140
changed-lines: 200

files-read:

- specs/13-ui.md §14.10 (das Menü der Einstellungen), §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap, aktueller Stand)
- apps/web/src/components/admin-layout.tsx (die Hülle)
- apps/web/src/components/__tests__/admin-layout.test.tsx (die Prüfung der migrierten Seiten)
- apps/web/src/routes/__tests__/index.test.tsx (die Routentabelle)
- apps/web/src/settings/settings-page.tsx (das Menü)
- apps/web/src/styles.css (der Kommentar über die eigenen `<main>` der Seiten)

files-write:

- apps/web/src/routes/__tests__/index.test.tsx
- apps/web/src/styles.css
- specs/13-ui.md
- PLAN.md
- work-packages/README.md
- CHANGELOG.md
- work-packages/m29/09-das-ausgangskriterium-der-phase.md (dieses Dokument)

interfaces:

- `GET /settings` — das Menü nennt jedes Modul der Administration mit seinem Pfad, Symbol und Beschreibung
- `GET /admin/users`, `GET /admin/roles`, `GET /admin/channels` — jede interne Seite trägt genau eine Landmark

## Task

1. `apps/web/src/routes/__tests__/index.test.tsx`: die Prüfung „rendert die Seite mit
   genau einer Landmark“ für `/settings`, `/admin/users`, `/admin/roles` und
   `/admin/channels` — die Routentabelle der App, nicht nur die Quelle einer Seite.
2. `apps/web/src/styles.css`: die Regel `.shell-main > main` (die das Padding und den
   Hintergrund der inneren `<main>` der Verwaltungsseiten neutralisierte) entfällt —
   keine interne Seite rendert mehr ein `<main>` in der Shell. Der Kommentar
   erklärt, dass die öffentlichen Seiten außerhalb der Shell ihr eigenes `<main>`
   behalten.
3. `specs/13-ui.md` §14.10 und §14.11 nennen den Stand der Phase: das Menü ist
   einspaltig mit Symbol, Beschreibung und Suche, die Abschnitte stehen offen, jeder
   Pfad der Einstellungen steht im Menü, jeder Kanal hat seine eigene Seite und jede
   interne Seite trägt genau eine Landmark.
4. `PLAN.md` §16: der Absatz der Phase 29 nennt den Abschluss der Phase; die
   Roadmap-Zeile der Phase bleibt.
5. `work-packages/README.md`: die Phase m29 ist geschlossen, die Zeile der
   WP-M29-09 ist „done“; `CHANGELOG.md` nennt den Abschluss der Phase.

## Non-goals

- Keine neue Funktion — die Phase sammelt nur, was sie gebaut hat.
- Die öffentlichen Seiten (Meldeformular, Statusseite, QR-Landing, Portal,
  Fernsehanzeige) und die Fehlerseite behalten ihr eigenes `<main>`: sie liegen
  außerhalb der Shell.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `npm run i18n:check` meldet keinen Schlüssel, der niemand
benutzt.

## Handoff

- Files changed: routes/__tests__/index.test.tsx, styles.css, specs/13-ui.md, PLAN.md, work-packages/README.md, CHANGELOG.md
- Interfaces added: keine
- Verified: the commands above
- Follow-up WP: keine — die Phase 29 ist geschlossen
- Open question: none
