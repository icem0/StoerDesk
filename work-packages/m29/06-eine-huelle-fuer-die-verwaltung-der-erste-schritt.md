# WP-M29-06: one shell for the administration — the first batch

format: ctx-256k
status: done
depends-on: WP-M29-11
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.11; PLAN.md §14, §16
spec-lines: 60
changed-lines: 260

files-read:

- specs/13-ui.md §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap)
- apps/web/src/components/Shell.tsx (der Rahmen mit dem `<main>` der Seite)
- apps/web/src/admin/users-page.tsx (eine Seite der Verwaltung)
- apps/web/src/admin/roles-page.tsx, apps/web/src/admin/groups-page.tsx (die Seiten der Rechte)

files-write:

- apps/web/src/components/admin-layout.tsx (neu)
- apps/web/src/components/__tests__/admin-layout.test.tsx (neu)
- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/user-create-page.tsx
- apps/web/src/admin/roles-page.tsx
- apps/web/src/admin/role-create-page.tsx
- apps/web/src/admin/groups-page.tsx
- apps/web/src/admin/group-create-page.tsx
- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/status-create-page.tsx

interfaces:

- `AdminLayout({ children })` — die Hülle einer Seite der Einstellungen und der Verwaltung: sie rendert ihren Inhalt in das `<main>` der Shell, damit die Seite genau eine Landmark trägt
- `GET /admin/users`, `GET /admin/roles`, `GET /admin/groups`, `GET /admin/statuses` — unverändert; nur die Hülle der Seite ändert sich

## Task

Jede Seite der Verwaltung trug ihr eigenes `<main>` — **im** `<main>` der Shell.
Zwei Landmarks auf einer Seite, doppeltes Padding (die Seite brachte `p-6` mit,
die Shell auch) und ein Rahmen, der auf dem Telefon breiter war als der Rest der
Oberfläche.

1. `apps/web/src/components/admin-layout.tsx`: die Hülle `AdminLayout` — ein
   einfaches `<div>`, das den Inhalt der Seite trägt. Die Shell bringt Rahmen,
   Farbe und Breite.
2. Die Seiten der Verwaltung rendern ihren Inhalt in die Hülle statt in ein
   eigenes `<main>`: Benutzer, Benutzer anlegen, Rollen, Rolle anlegen, Gruppen,
   Gruppe anlegen, Status, Status anlegen.
3. `apps/web/src/components/__tests__/admin-layout.test.tsx`: die Hülle rendert
   ihren Inhalt und bringt kein eigenes `<main>` mit; keine Seite der
   Verwaltung bringt ein eigenes `<main>` mit (die Prüfung liest die Quellen).

## Non-goals

- Der Inhalt der Seiten ändert sich nicht — nur ihre Hülle.
- Die Seiten der Kanäle, der Texte, der Fehler, der Eskalation, der Bereitschaft
  und des BMAcloud-Abgleichs kommen mit den nächsten Paketen (WP-M29-07, WP-M29-08).
- Die öffentlichen Seiten (Meldeformular, Statusseite, Portal) liegen außerhalb
  der Shell und behalten ihr `<main>`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; die neue Prüfung schlägt vor der Änderung fehl und danach
grün.

## Handoff

- Files changed: admin-layout.tsx, admin-layout.test.tsx, die acht Seiten der Rechte und der Status
- Interfaces added: `AdminLayout`
- Verified: the commands above
- Follow-up WP: WP-M29-07 (die Seiten der Texte, der Fehler, der Eskalation, der Bereitschaft, des BMAcloud-Abgleichs und der Kanäle)
- Open question: none
