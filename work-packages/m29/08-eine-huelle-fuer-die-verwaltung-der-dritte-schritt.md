# WP-M29-08: one shell for the administration — the third batch

format: ctx-256k
status: done
depends-on: WP-M29-07
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.11; PLAN.md §14, §16
spec-lines: 60
changed-lines: 220

files-read:

- specs/13-ui.md §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap)
- apps/web/src/components/admin-layout.tsx (die Hülle von WP-M29-06)
- apps/web/src/features/notifications/inbox-page.tsx (der Posteingang)
- apps/web/src/features/notifications/web-push-help-page.tsx (die Hilfe des Web-Push)

files-write:

- apps/web/src/components/admin-layout.tsx
- apps/web/src/components/__tests__/admin-layout.test.tsx
- apps/web/src/admin/email-page.tsx
- apps/web/src/settings/branding-page.tsx
- apps/web/src/settings/my-settings-page.tsx
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/settings/sticker-template-page.tsx
- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/features/notifications/web-push-help-page.tsx

interfaces:

- `AdminLayout({ children, className })` — die Hülle; `className` hält die Breite einer Seite, die schmaler bleibt als die der Shell (der Posteingang und die Hilfe des Web-Push)
- `GET /admin/email`, `GET /settings/branding`, `GET /v1/me`, `GET /v1/notifications/accounts` — unverändert

## Task

Der letzte Schritt: die Seiten der Einstellungen, der Mailbox, des Posteingangs und
des eigenen Kontos rendern ihren Inhalt in die Hülle `AdminLayout`.

1. `apps/web/src/components/admin-layout.tsx`: die Hülle nimmt ein `className` an,
   damit eine Seite schmaler bleiben kann als die der Shell.
2. `apps/web/src/admin/email-page.tsx`: die Hülle.
3. `apps/web/src/settings/branding-page.tsx`, `my-settings-page.tsx`,
   `notifications-page.tsx` und `sticker-template-page.tsx`: die Hülle.
4. `apps/web/src/features/oncall/my-shifts-page.tsx`: die Hülle.
5. `apps/web/src/features/notifications/inbox-page.tsx` und
   `apps/web/src/features/notifications/web-push-help-page.tsx`: die Hülle mit
   `className="mx-auto w-full max-w-3xl"` — ihre Breite bleibt, ihr eigenes
   Padding nicht (das bringt die Shell).
6. `apps/web/src/components/__tests__/admin-layout.test.tsx`: die Liste der
   migrierten Seiten ist vollständig.

Danach trägt keine interne Seite mehr ein eigenes `<main>` — nur die öffentlichen
Seiten (Meldeformular, Statusseite, QR-Landing, Portal, Fernsehanzeige) und die
Fehlerseite, die außerhalb der Shell liegen.

## Non-goals

- Der Inhalt der Seiten ändert sich nicht — nur ihre Hülle.
- Die öffentlichen Seiten und die Seiten des Kundenportals behalten ihr `<main>`.
- Der Kommentar in `styles.css` über die eigenen `<main>` der Verwaltungsseiten
  wird mit dem Ausgangskriterium der Phase (WP-M29-09) angepasst.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; die Prüfung der migrierten Seiten schlägt vor der Änderung
fehl und danach grün.

## Handoff

- Files changed: admin-layout.tsx, admin-layout.test.tsx, die acht letzten Seiten, der Kommentar in styles.css folgt mit WP-M29-09
- Interfaces added: `AdminLayout` nimmt ein `className` an
- Verified: the commands above
- Follow-up WP: WP-M29-09 (das Ausgangskriterium der Phase)
- Open question: none
