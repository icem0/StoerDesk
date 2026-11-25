# WP-M29-07: one shell for the administration — the second batch

format: ctx-256k
status: done
depends-on: WP-M29-06
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.11; PLAN.md §14, §16
spec-lines: 60
changed-lines: 240

files-read:

- specs/13-ui.md §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche), §16 (Phasen-Roadmap)
- apps/web/src/components/admin-layout.tsx (die Hülle von WP-M29-06)
- apps/web/src/admin/text-templates-page.tsx, apps/web/src/admin/detected-errors-page.tsx (die Seiten der Meldungen)
- apps/web/src/admin/oncall-page.tsx (die Seite der Bereitschaft)

files-write:

- apps/web/src/components/__tests__/admin-layout.test.tsx
- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/text-template-create-page.tsx
- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/detected-error-create-page.tsx
- apps/web/src/admin/escalation-stage-create-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/oncall-pool-create-page.tsx
- apps/web/src/admin/bma-sync-page.tsx

interfaces:

- `AdminLayout` — die Hülle von WP-M29-06; der Inhalt der Seite ändert sich nicht
- `GET /admin/text-templates`, `GET /admin/detected-errors`, `GET /admin/oncall/pools`, `GET /admin/bma-sync` — unverändert

## Task

Der zweite Schritt: die Seiten der Störungsarten, der festgestellten Fehler, der
Eskalationsstufen, der Bereitschaft und des BMAcloud-Abgleichs rendern ihren Inhalt
in die Hülle `AdminLayout` statt in ein eigenes `<main>`.

1. `apps/web/src/admin/text-templates-page.tsx` und
   `apps/web/src/admin/text-template-create-page.tsx`: die Hülle.
2. `apps/web/src/admin/detected-errors-page.tsx` und
   `apps/web/src/admin/detected-error-create-page.tsx`: die Hülle.
3. `apps/web/src/admin/escalation-stage-create-page.tsx`: die Hülle.
4. `apps/web/src/admin/oncall-page.tsx` und
   `apps/web/src/admin/oncall-pool-create-page.tsx`: die Hülle.
5. `apps/web/src/admin/bma-sync-page.tsx`: die Hülle.
6. `apps/web/src/components/__tests__/admin-layout.test.tsx`: die Liste der
   migrierten Seiten wächst um diese acht.

## Non-goals

- Der Inhalt der Seiten ändert sich nicht — nur ihre Hülle.
- Die Seiten der Einstellungen, der Mailbox, des Posteingangs und des eigenen
   Kontos kommen mit WP-M29-08.
- Die öffentlichen Seiten und die Seiten des Kundenportals behalten ihr `<main>`.

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

- Files changed: die acht Seiten der Meldungen, der Eskalation, der Bereitschaft und des BMAcloud-Abgleichs, die Prüfung der Hülle
- Interfaces added: keine
- Verified: the commands above
- Follow-up WP: WP-M29-08 (die Seiten der Einstellungen, der Mailbox, des Posteingangs und des eigenen Kontos)
- Open question: none
